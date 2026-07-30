import {
  ClientCacheBuffer,
  Diagnostic,
  Environment,
  EndpointLifecycle,
  LogDestination,
  LogFormat,
  Logger,
  LogLevel,
  Millis,
  ServerNode,
  ControllerBehavior,
  ClientNode,
  CommissioningClient,
  NetworkClient,
  StorageService,
  Time
} from "@matter/main";
import { GeneralCommissioning } from "@matter/main/clusters";
import { ManualPairingCodeCodec, NodeId, EndpointNumber } from "@matter/main/types";
import { Read } from "@matter/protocol";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { AdministratorCommissioningClient } from "@matter/node/behaviors/administrator-commissioning";
import { DescriptorClient } from "@matter/node/behaviors/descriptor";
import { Endpoint } from "@matter/node";
import fs from "fs";
import path from "path";

import log from "../loggers.js";
import type { RedisStorage } from "../storage/redis-storage.js";
import { driverConfig } from "../config.js";
import { JsonFileStorageDriver } from "@matter/nodejs";
import { BackgroundTask } from "../background_task.js";
import { configuredDevices, subscribedEntities } from "../globals.js";

class MatterBridge {
  id: NodeId;
  vendorName: string;
  productName: string;
  label: string;
  rootNode: ClientNode;
  aggregatorEndpoint: Endpoint;
  entityIdentifier: string;

  constructor(
    id: NodeId,
    vendorName: string,
    productName: string,
    label: string,
    rootNode: ClientNode,
    aggregatorEndpoint: Endpoint
  ) {
    this.id = id;
    this.vendorName = vendorName;
    this.productName = productName;
    this.label = label;
    this.rootNode = rootNode;
    this.aggregatorEndpoint = aggregatorEndpoint;

    this.entityIdentifier = this.label.replace(" ", "_");
  }
}

class ControllerNode {
  private environment: Environment;
  private backgroundRefreshTask: BackgroundTask;
  private redisStorage: RedisStorage | undefined;
  private serverNode: ServerNode | undefined;
  private serverNodeStarted: boolean = false;
  private addMatterBridgeHandler: ((matterBridge: MatterBridge) => Promise<void>) | null = null;
  private removeMatterBridgeHandler: ((matterBridge: MatterBridge | null) => Promise<void>) | null = null;
  private updateMatterBridgeHandler: ((matterBridge: MatterBridge) => Promise<void>) | null = null;
  private structureChangeListeners = new Map<string, () => void>();
  // Maps peer ID → sorted endpoint numbers under the aggregator, set once the node first comes online.
  // Used by the background task to detect structural changes when autoSubscribe is false.
  private knownAggregatorEndpoints = new Map<string, number[]>();

  constructor() {
    this.environment = Environment.default;

    this.backgroundRefreshTask = new BackgroundTask(60000, async (signal) => {
      log.debug("Background refresh task starting.");

      try {
        // Refresh attribute values for all subscribed entities.
        for (const [matterBridgeDeviceId, matterBridgeDevice] of configuredDevices.entries()) {
          for (const [deviceId, device] of matterBridgeDevice.devices) {
            if (subscribedEntities.get(`${matterBridgeDeviceId}|${deviceId}`)) {
              if (signal.aborted) {
                log.debug("Background refresh task aborted.");
                return;
              }

              await device.refreshAllAttributes({
                initFromMatterCache: false,
                onlyReturnChangedAttributes: false,
                requestFromRemote: true
              });
            }
          }
        }

        // Check for structural changes (added/removed endpoints) on each commissioned node.
        // With autoSubscribe disabled there are no push notifications, so we detect changes by
        // comparing the current endpoint list against the snapshot taken when each node came online.
        if (this.serverNode) {
          for (const peer of this.serverNode.peers) {
            if (signal.aborted) {
              log.debug("Background refresh task aborted.");
              return;
            }

            const peerAddress = peer.maybeStateOf(CommissioningClient)?.peerAddress;
            if (!peerAddress) continue;

            const peerId = peer.id as string;
            const knownEndpointNums = this.knownAggregatorEndpoints.get(peerId);

            // Skip nodes that haven't come online yet — no baseline to compare against.
            if (!knownEndpointNums) continue;

            const aggregator = peer.parts.get(1);
            if (!aggregator) continue;

            // Read the aggregator's Descriptor first. Its partsList lists the bridged device
            // endpoints as direct children, so mutate() installs any newly added endpoints
            // under the aggregator (their correct parent). Installing here first means that
            // when the root read runs next, the new endpoints are already descendants of root
            // via the aggregator, so the root's install path skips them (isAlreadyDescendant).
            // Doing it the other way round causes a "already active" crash: the root read would
            // install the new endpoint under root, and the subsequent aggregator read would try
            // to re-initialize it as a child of the aggregator.
            await aggregator.getStateOf(DescriptorClient);

            // Read the root endpoint's Descriptor second. Its partsList is the flat list of ALL
            // endpoints on the node, so ClientStructure.mutate() will schedule #erase() for any
            // endpoints that have disappeared from the bridge since the last check. The erase
            // fires endpoint.delete() which removes the endpoint from aggregator.parts.
            // New endpoints installed in the step above are already descendants of root (via the
            // aggregator) and are therefore skipped by the install path here.
            await peer.getStateOf(DescriptorClient);

            const currentEndpointNums = [...aggregator.parts].map((p) => p.number ?? 0).sort((a, b) => a - b);

            const hasChanged =
              currentEndpointNums.length !== knownEndpointNums.length ||
              currentEndpointNums.some((n, i) => n !== knownEndpointNums[i]);

            if (hasChanged) {
              log.info(`Node ${peerAddress.nodeId} structure changed (detected during background refresh)`);

              // Identify genuinely new endpoints before overwriting the snapshot.
              const newEndpointNums = currentEndpointNums.filter((n) => !knownEndpointNums.includes(n));

              // Update snapshot before async work so re-entrant ticks see the latest known state.
              this.knownAggregatorEndpoints.set(peerId, currentEndpointNums);

              // For each new endpoint: read all its attributes from the remote device.
              // This drives ClientStructure.mutate() which (a) injects cluster behaviors such as
              // BridgedDeviceBasicInformationClient onto the new endpoint objects and (b) persists
              // the attribute data to storage via DatasourceCache.externalSet().
              for (const newEndpointNum of newEndpointNums) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for await (const _chunk of peer.interaction.read(
                  Read(Read.Attribute({ endpoint: EndpointNumber(newEndpointNum) }))
                )) {
                  // Consume the async generator to drive mutate() to completion.
                }
              }

              // Flush the ClientCacheBuffer so the attribute data written during the
              // new-endpoint reads is persisted to storage immediately, without waiting
              // for the periodic 20-minute timer to fire.
              if (this.serverNode.env.has(ClientCacheBuffer)) {
                await this.serverNode.env.get(ClientCacheBuffer).flush();
              }

              if (this.redisStorage) await this.redisStorage.bgSave();

              const matterBridge = await this.getMatterBridge(peerAddress.nodeId);
              if (this.updateMatterBridgeHandler && matterBridge) {
                await this.updateMatterBridgeHandler(matterBridge);
              }
            }
          }
        }
      } catch (e) {
        log.error(e);
      }

      log.debug("Background refresh task completed.");
    });
  }

  async init(
    initializeConfig: boolean,
    addMatterBridgeHandler: (matterBridge: MatterBridge) => Promise<void>,
    removeMatterBridgeHandler: (matterBridge: MatterBridge | null) => Promise<void>,
    updateMatterBridgeHandler: (matterBridge: MatterBridge) => Promise<void>
  ) {
    if (this.serverNode) return;

    const matterjsDir = path.join(process.env.UC_DATA_HOME || "./", "matter");
    const matterjsConfigFile = path.join(matterjsDir, "config.json");

    this.environment.vars.set("path.root", matterjsDir);
    this.environment.vars.set("path.config", matterjsConfigFile);

    const storageService = this.environment.get(StorageService);

    const storageType = process.env.MATTER_STORAGE || "json";

    log.info(`Using storage ${storageType} location: ${storageService.location}.`);

    if (storageType == "json") {
      storageService.registerDriver(JsonFileStorageDriver);
      storageService.configuredDriver = "json";

      const oldJsonStorageFile = path.join(process.env.UC_DATA_HOME || "./", "matter.json");

      if (fs.existsSync(oldJsonStorageFile) && !fs.existsSync(matterjsDir) && driverConfig.matterUniqueId) {
        log.warn(`Migrating old JSON storage file ${oldJsonStorageFile}.`);

        const newConfigDir = path.join(matterjsDir, driverConfig.matterUniqueId);
        fs.mkdirSync(newConfigDir, { recursive: true });
        fs.copyFileSync(oldJsonStorageFile, path.join(newConfigDir, "storage.json"));

        const jsonData = JSON.stringify({
          kind: "json",
          type: "kv"
        });

        fs.writeFileSync(path.join(newConfigDir, "driver.json"), jsonData);
      }

      if (!initializeConfig && !fs.existsSync(matterjsDir)) {
        // We do not initalize at this moment.
        return false;
      }
    } else if (storageType == "valkeyrie") {
      const valkeyrieStorageFile = path.join(process.env.UC_DATA_HOME || "./", "matter.sqlite3");

      if (!initializeConfig && !fs.existsSync(valkeyrieStorageFile)) {
        // We do not initalize at this moment.
        return false;
      }

      const { ValkeyrieStorageDriver } = await import("../storage/valkeyrie-storage-driver.js");
      const { ValkeyrieBlobStorageDriver } = await import("../storage/valkeyrie-blob-storage-driver.js");

      storageService.registerDriver(ValkeyrieStorageDriver);
      storageService.registerBlobDriver(ValkeyrieBlobStorageDriver);
      storageService.configuredDriver = "valkeyrie";
      storageService.configuredBlobDriver = "valkeyrie";

      this.environment.vars.set("valkeyrie.path", valkeyrieStorageFile);
    } else if (storageType?.startsWith("redis://")) {
      const { RedisStorage } = await import("../storage/redis-storage.js");
      const { RedisStorageDriver } = await import("../storage/redis-storage-driver.js");
      const { RedisBlobStorageDriver } = await import("../storage/redis-blob-storage-driver.js");

      storageService.registerDriver(RedisStorageDriver);
      storageService.registerBlobDriver(RedisBlobStorageDriver);
      storageService.configuredDriver = "redis";
      storageService.configuredBlobDriver = "redis";

      this.redisStorage = RedisStorage.instance;
      this.environment.vars.set("redis.url", storageType);
    }

    this.addMatterBridgeHandler = addMatterBridgeHandler;
    this.removeMatterBridgeHandler = removeMatterBridgeHandler;
    this.updateMatterBridgeHandler = updateMatterBridgeHandler;

    const defaultFabriclabel = process.env.MATTER_FABRIC_LABEL || "UC Matter Integration";

    let config = driverConfig.get();

    if (!config.matterUniqueId || !config.matterFabricLabel) {
      config.matterUniqueId = Time.nowMs.toString();
      config.matterFabricLabel = defaultFabriclabel;

      driverConfig.update(config);
      driverConfig.store();
    }

    /** Create Matter Controller ServerNode with ControllerBehavior and bind it to the Environment. */
    this.serverNode = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
      environment: this.environment,
      id: config.matterUniqueId,
      controller: {
        adminFabricLabel: config.matterFabricLabel
      },
      commissioning: {
        enabled: false // The controller node is never directly commissionable
      },
      sessions: { intervals: { idleInterval: Millis(1000), activeThreshold: Millis(65535) } }
    });

    log.info(`Matter Client API Controller initialized`);

    return true;
  }

  async start() {
    if (!this.serverNode || this.serverNodeStarted) return;

    /** Start the Matter Controller Node */
    await this.serverNode.start();

    // Connect to all commissioned nodes
    await this.connectAllNodes();

    this.startBackgroundRefreshTask();

    if (this.redisStorage) await this.redisStorage.bgSave();

    this.serverNodeStarted = true;

    log.info(`Matter Client API Controller started`);
  }

  startBackgroundRefreshTask() {
    if (!driverConfig.autoSubscribe) {
      this.setBackgroundRefreshTaskInterval(driverConfig.backgroundRefreshInterval);
      this.backgroundRefreshTask.start();
    }
  }

  async stop() {
    if (!this.serverNode) return;

    await this.backgroundRefreshTask.stop();

    /** Stop the Matter Controller Node */
    await this.serverNode.close();

    this.serverNodeStarted = false;

    log.info(`Matter Client API Controller stopped`);
  }

  async stopBackgroundRefreshTask() {
    return this.backgroundRefreshTask.stop();
  }

  setBackgroundRefreshTaskInterval(interval: number) {
    this.backgroundRefreshTask.setInterval(interval * 1000);
  }

  async getNodeStructure(nodeId: NodeId) {
    if (!this.serverNode) return undefined;

    const clientNode = this.getClientNodeById(nodeId);
    if (!clientNode) return undefined;

    // Use legacy PairedNode wrapper for logStructure() output
    let nodeStructureLog: string | undefined;

    Logger.destinations.temp = LogDestination({
      write: (formattedLog: string) => {
        nodeStructureLog = formattedLog;
      },
      level: LogLevel.INFO,
      format: LogFormat("plain")
    });

    this.logClientNodeStructure(clientNode, nodeStructureLog);
    delete Logger.destinations.temp;

    return nodeStructureLog;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private logClientNodeStructure(clientNode: ClientNode, _out: string | undefined) {
    // Traverse the ClientNode's endpoint tree and log it using matter.js Logger
    const nodeId = clientNode.peerAddress?.nodeId;
    Logger.get("ClientNode").info(`Node ${nodeId}:`);
    for (const part of clientNode.parts) {
      Logger.get("ClientNode").info(`  Endpoint ${part.number}: ${[...part.parts].map((p) => p.number).join(", ")}`);
    }
  }

  async updateFabricLabel(label: string) {
    if (!this.serverNode) return;

    await this.serverNode.setStateOf(ControllerBehavior, { adminFabricLabel: label });
  }

  getLogLevel(): LogLevel {
    return this.environment.vars.get("log.level");
  }

  setLogLevel(logLevel: LogLevel) {
    this.environment.vars.set("log.level", logLevel);
  }

  isCommissioned() {
    if (!this.serverNode) return false;

    return this.serverNode.peers.size > 0;
  }

  isStarted() {
    if (!this.serverNode) return false;

    return this.serverNodeStarted;
  }

  isInitialized() {
    return !!this.serverNode;
  }

  /**
   * Get a ClientNode from the peer set by NodeId.
   */
  private getClientNodeById(nodeId: NodeId): ClientNode | undefined {
    if (!this.serverNode) return undefined;

    for (const peer of this.serverNode.peers) {
      const peerAddress = peer.maybeStateOf(CommissioningClient)?.peerAddress;
      if (peerAddress && peerAddress.nodeId === nodeId) {
        return peer;
      }
    }
    return undefined;
  }

  async pair(pairingCode: string): Promise<NodeId | undefined> {
    if (!this.serverNode) return undefined;

    let longDiscriminator: number | undefined;
    let setupPin: number | undefined;
    let shortDiscriminator: number | undefined;

    if (pairingCode !== undefined) {
      const pairingCodeCodec = ManualPairingCodeCodec.decode(pairingCode);
      shortDiscriminator = pairingCodeCodec.shortDiscriminator;
      longDiscriminator = undefined;
      setupPin = pairingCodeCodec.passcode;
      log.debug(`Data extracted from pairing code: ${Diagnostic.json(pairingCodeCodec)}`);
    }

    if ((shortDiscriminator === undefined && longDiscriminator === undefined) || setupPin === undefined) {
      throw new Error(
        "Please specify the longDiscriminator of the device to commission with -longDiscriminator or provide a valid passcode with --passcode=xxxxxx"
      );
    }

    console.time("Commissioning took");

    log.info(`Commissioning with discriminator ${shortDiscriminator ?? longDiscriminator} ...`);

    const clientNode = await this.serverNode.peers.commission({
      passcode: setupPin,
      ...(longDiscriminator !== undefined ? { longDiscriminator } : { shortDiscriminator }),
      regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
      regulatoryCountryCode: "XX",
      discoveryCapabilities: { onIpNetwork: true },
      autoSubscribe: false // Do not auto subscribe; connection is managed explicitly
    });

    const nodeId = clientNode.peerAddress?.nodeId;

    if (!nodeId) {
      log.error("Commissioning completed but nodeId is undefined");
      return undefined;
    }

    log.info(`Commissioning successfully done with nodeId ${nodeId}`);

    // Listen for the node coming online to set up the bridge
    clientNode.lifecycle.online.on(async () => {
      var matterBridge = await this.getMatterBridge(nodeId);

      if (this.addMatterBridgeHandler && matterBridge) {
        await this.addMatterBridgeHandler(matterBridge);
      }

      if (this.redisStorage) await this.redisStorage.bgSave();

      console.timeEnd("Commissioning took");
      log.info(`Node ${nodeId} successfully initialized`);
    });

    this.connectClientNode(clientNode);

    return nodeId;
  }

  async connectAllNodes() {
    if (!this.serverNode) return;

    for (const peer of this.serverNode.peers) {
      try {
        this.connectClientNode(peer);
      } catch (e) {
        log.error(e);
      }
    }
  }

  async disconnectAllNodes() {
    if (!this.serverNode) return;

    for (const peer of this.serverNode.peers) {
      try {
        const nodeId = peer.peerAddress?.nodeId;
        log.debug(`Disconnecting node ${nodeId}`);
        await peer.disable();
        log.debug(`Node ${nodeId} disconnected.`);
      } catch (e) {
        log.error(e);
      }
    }
  }

  connectClientNode(clientNode: ClientNode) {
    if (!this.serverNode) return;

    const peerId = clientNode.id as string;

    // Configure subscription mode before enabling
    void clientNode
      .setStateOf(NetworkClient, { autoSubscribe: driverConfig.autoSubscribe })
      .then(() => clientNode.enable())
      .catch((e) => log.error(`Failed to enable node ${clientNode.peerAddress?.nodeId}: ${e}`));

    if (driverConfig.autoSubscribe) {
      if (!this.structureChangeListeners.has(peerId)) {
        // With subscriptions active the controller receives push notifications, so we can react to
        // structure changes immediately via the lifecycle event.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const structureChangedListener = (type: EndpointLifecycle.Change, _endpoint: Endpoint): void => {
          if (
            type === EndpointLifecycle.Change.Installed ||
            type === EndpointLifecycle.Change.Destroyed ||
            type === EndpointLifecycle.Change.ServersChanged ||
            type === EndpointLifecycle.Change.ClientsChanged
          ) {
            const nodeId = clientNode.peerAddress?.nodeId;
            log.info(`Node ${nodeId} structure changed (${type})`);

            void (async () => {
              if (this.redisStorage) await this.redisStorage.bgSave();

              if (nodeId) {
                const matterBridge = await this.getMatterBridge(nodeId);

                if (this.updateMatterBridgeHandler && matterBridge) {
                  await this.updateMatterBridgeHandler(matterBridge);
                }
              }
            })();
          }
        };

        clientNode.lifecycle.changed.on(structureChangedListener);

        this.structureChangeListeners.set(peerId, () => {
          clientNode.lifecycle.changed.off(structureChangedListener);
        });
      }
    } else {
      // Without subscriptions the controller polls devices. Structure changes are detected in the
      // background refresh task by comparing endpoint snapshots. Take the baseline snapshot once
      // the node first comes online so the task has something to compare against.
      clientNode.lifecycle.online.once(async () => {
        this.snapshotAggregatorEndpoints(clientNode);
      });

      // Store a no-op unsubscribe so the has() guard above stays consistent across reconnects.
      this.structureChangeListeners.set(peerId, () => {});
    }
  }

  /**
   * Record the sorted list of endpoint numbers currently present under the aggregator (endpoint 1)
   * of the given ClientNode. Called once the node comes online; used by the background refresh task
   * to detect structural changes when autoSubscribe is false.
   */
  private snapshotAggregatorEndpoints(clientNode: ClientNode): void {
    const peerId = clientNode.id as string;
    const aggregator = clientNode.parts.get(1);
    if (!aggregator) return;
    const endpointNums = [...aggregator.parts].map((p) => p.number ?? 0).sort((a, b) => a - b);
    this.knownAggregatorEndpoints.set(peerId, endpointNums);
    log.debug(`Snapshotted ${endpointNums.length} aggregator endpoints for node ${clientNode.peerAddress?.nodeId}`);
  }

  async openEnhancedCommissioningWindow(nodeId: NodeId) {
    if (!this.serverNode) return undefined;

    try {
      const clientNode = this.getClientNodeById(nodeId);
      if (!clientNode) return undefined;

      // Read BasicInformation from cache for vendorId and productId
      const biState = clientNode.maybeStateOf(BasicInformationClient);
      if (!biState) {
        log.error(`BasicInformation cluster not available for node ${nodeId}`);
        return undefined;
      }

      // Delegate to the legacy PairedNode.openEnhancedCommissioningWindow via AdministratorCommissioning commands
      // We use the same logic as the old PairedNode implementation
      const adminCommissioningEndpoint = clientNode;
      const adminCommissioningCommands = adminCommissioningEndpoint.commandsOf(AdministratorCommissioningClient);

      // Revoke any existing commissioning window first
      try {
        await adminCommissioningCommands.revokeCommissioning();
      } catch (e) {
        log.error(e);
        // Ignore if no window is open
      }

      // Generate PASE credentials
      const { Crypto } = await import("@matter/main");
      const crypto = this.environment.get(Crypto);
      const { PaseClient } = await import("@matter/protocol");
      const discriminator = PaseClient.generateRandomDiscriminator(crypto);
      const passcode = PaseClient.generateRandomPasscode(crypto);
      const salt = crypto.randomBytes(32);
      const iterations = 1000; // CRYPTO_PBKDF_ITERATIONS_MIN
      const pakePasscodeVerifier = await PaseClient.generatePakePasscodeVerifier(crypto, passcode, {
        iterations,
        salt
      });

      const commissioningTimeout = 900;
      await adminCommissioningCommands.openCommissioningWindow({
        commissioningTimeout,
        pakePasscodeVerifier,
        salt,
        iterations,
        discriminator
      });

      const { QrPairingCodeCodec, ManualPairingCodeCodec, CommissioningFlowType, DiscoveryCapabilitiesSchema } =
        await import("@matter/main/types");

      const vendorId = biState.vendorId;
      const productId = biState.productId;

      const qrPairingCode = QrPairingCodeCodec.encode([
        {
          version: 0,
          vendorId,
          productId,
          flowType: CommissioningFlowType.Standard,
          discriminator,
          passcode,
          discoveryCapabilities: DiscoveryCapabilitiesSchema.encode({ onIpNetwork: true })
        }
      ]);

      const manualPairingCode = ManualPairingCodeCodec.encode({
        discriminator,
        passcode,
        flowType: CommissioningFlowType.Standard
      });

      return { manualPairingCode, qrPairingCode };
    } catch (e) {
      log.error(e);
    }

    return undefined;
  }

  async getMatterBridge(nodeId: NodeId): Promise<MatterBridge | undefined> {
    if (!this.serverNode) return undefined;

    const clientNode = this.getClientNodeById(nodeId);
    if (!clientNode) return undefined;

    // Get the aggregator endpoint (endpoint number 1 in a bridge)
    const aggregatorEndpoint = clientNode.parts.get(1);
    if (!aggregatorEndpoint) return undefined;

    // Read BasicInformation from cache (populated after first connection)
    let biState = clientNode.maybeStateOf(BasicInformationClient);

    if (!biState) {
      // Fall back to remote read if cache not yet populated
      try {
        biState = await clientNode.getStateOf(BasicInformationClient);
      } catch (e) {
        log.error(`Failed to read BasicInformation for node ${nodeId}: ${e}`);
        return undefined;
      }
    }

    const vendorName = biState.vendorName ?? "";
    const productName = biState.productName ?? "";
    const label = biState.nodeLabel ?? "";

    return new MatterBridge(nodeId, vendorName, productName, label, clientNode, aggregatorEndpoint);
  }

  async getMatterBridges(): Promise<MatterBridge[]> {
    var matterBridges: MatterBridge[] = [];

    if (!this.serverNode) return matterBridges;

    for (const peer of this.serverNode.peers) {
      const peerAddress = peer.maybeStateOf(CommissioningClient)?.peerAddress;
      if (!peerAddress) continue;

      var matterBridge = await this.getMatterBridge(peerAddress.nodeId);

      if (matterBridge) {
        matterBridges.push(matterBridge);
      }
    }

    return matterBridges;
  }

  async removeNode(nodeId: NodeId, forceRemove: boolean) {
    if (!this.serverNode) return;

    const clientNode = this.getClientNodeById(nodeId);
    if (!clientNode) return;

    const matterBridge = await this.getMatterBridge(nodeId);

    if (matterBridge) {
      try {
        await clientNode.decommission();
      } catch (e) {
        if (forceRemove) {
          await clientNode.delete();
        } else {
          throw e;
        }
      }

      if (this.redisStorage) await this.redisStorage.bgSave();

      if (this.removeMatterBridgeHandler) {
        await this.removeMatterBridgeHandler(matterBridge);
      }

      const peerId = clientNode.id as string;
      const unsubscribe = this.structureChangeListeners.get(peerId);
      if (unsubscribe) {
        unsubscribe();
        this.structureChangeListeners.delete(peerId);
      }
      this.knownAggregatorEndpoints.delete(peerId);
    }
  }

  async reset() {
    if (!this.serverNode) return;

    for (const peer of this.serverNode.peers) {
      try {
        await peer.decommission();
      } catch (e) {
        // Ignore errors because we reset everything
        log.error(e);
      }

      const peerId = peer.id as string;
      const unsubscribe = this.structureChangeListeners.get(peerId);
      if (unsubscribe) {
        unsubscribe();
      }
    }
    this.structureChangeListeners.clear();
    this.knownAggregatorEndpoints.clear();

    await this.stop();
    await this.serverNode.erase();

    if (this.removeMatterBridgeHandler) {
      await this.removeMatterBridgeHandler(null);
    }

    await this.start();
  }
}

const controllerNode = new ControllerNode();

export { MatterBridge, controllerNode };
