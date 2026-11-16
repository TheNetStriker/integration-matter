import {
  ClientCacheBuffer,
  ClientNode,
  ControllerBehavior,
  Diagnostic,
  EndpointLifecycle,
  Environment,
  LogDestination,
  LogFormat,
  Logger,
  LogLevel,
  NetworkClient,
  ObserverGroup,
  ServerNode,
  StorageService,
  Time
} from "@matter/main";
import { GeneralCommissioning } from "@matter/main/clusters";
import { ManualPairingCodeCodec, NodeId } from "@matter/main/types";
import { FabricAuthority } from "@matter/protocol";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { OperationalCredentialsClient } from "@matter/node/behaviors/operational-credentials";
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
  private fabric: Awaited<ReturnType<FabricAuthority["defaultFabric"]>> | undefined;
  private serverNodeStarted: boolean = false;
  private addMatterBridgeHandler: ((matterBridge: MatterBridge) => Promise<void>) | null = null;
  private removeMatterBridgeHandler: ((matterBridge: MatterBridge | null) => Promise<void>) | null = null;
  private updateMatterBridgeHandler: ((matterBridge: MatterBridge) => Promise<void>) | null = null;
  // Per-peer ObserverGroup; closed when the peer is deleted.
  private peerObservers = new Map<ClientNode, ObserverGroup>();

  constructor() {
    this.environment = Environment.default;

    this.backgroundRefreshTask = new BackgroundTask(60000, async (signal) => {
      log.debug("Background refresh task starting.");

      try {
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
        return false;
      }
    } else if (storageType == "valkeyrie") {
      const valkeyrieStorageFile = path.join(process.env.UC_DATA_HOME || "./", "matter.sqlite3");

      if (!initializeConfig && !fs.existsSync(valkeyrieStorageFile)) {
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

    const defaultFabricLabel = process.env.MATTER_FABRIC_LABEL || "UC Matter Integration";

    let config = driverConfig.get();

    if (!config.matterUniqueId || !config.matterFabricLabel) {
      config.matterUniqueId = Time.nowMs.toString();
      config.matterFabricLabel = defaultFabricLabel;

      driverConfig.update(config);
      driverConfig.store();
    }

    let serverNode: ServerNode | undefined;

    try {
      serverNode = await ServerNode.create(ServerNode.RootEndpointWithoutGroupcast.with(ControllerBehavior), {
        environment: this.environment,
        id: config.matterUniqueId,
        commissioning: { enabled: false },
        controller: { adminFabricLabel: config.matterFabricLabel },
        subscriptions: { persistenceEnabled: false }
      });

      // Obtain (or create) the single controller fabric.
      const fabricAuthority = await serverNode.env.load(FabricAuthority);
      this.fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: config.matterFabricLabel });

      // Repair peer settings the legacy API may have persisted as disabled/non-subscribing,
      // and configure the current autoSubscribe preference.
      for (const peer of serverNode.peers.commissioned) {
        await peer.setStateOf(NetworkClient, {
          isDisabled: false,
          autoSubscribe: driverConfig.autoSubscribe
        });
      }

      // Assign serverNode before registering peer observers so that onPeerSeeded → getMatterBridge
      // → getClientNodeById can resolve peers correctly even when a peer is already seeded at
      // attach time and the callback fires synchronously.
      this.serverNode = serverNode;

      // Register per-peer observers before start() so we don't miss initial seeded events.
      for (const peer of serverNode.peers.commissioned) {
        this.watchPeer(peer);
      }
      serverNode.peers.added.on((peer) => this.watchPeer(peer));
      serverNode.peers.deleted.on((peer) => {
        const group = this.peerObservers.get(peer);
        if (group) {
          group.close();
          this.peerObservers.delete(peer);
        }
      });
    } catch (e) {
      if (serverNode) {
        await serverNode.close().catch((closeErr) => log.error("Error closing node after init failure:", closeErr));
      }
      this.serverNode = undefined;
      this.fabric = undefined;
      throw e;
    }

    log.info(`Matter Client API Controller initialized`);

    return true;
  }

  /**
   * Attach lifecycle observers to a peer. Called for all already-commissioned peers before start()
   * and for newly added peers via peers.added.
   */
  private watchPeer(peer: ClientNode): void {
    if (this.peerObservers.has(peer)) return;

    const group = new ObserverGroup();
    this.peerObservers.set(peer, group);

    // If the peer is already seeded at attach time, add the bridge immediately.
    if (peer.lifecycle.isSeeded) {
      void this.onPeerSeeded(peer);
    } else {
      group.on(peer.lifecycle.seeded, async () => {
        await this.onPeerSeeded(peer);
      });
    }

    // Debounce structure changes: EndpointLifecycle fires one event per endpoint, so
    // we delay and let rapid bursts coalesce into a single update call.
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    group.on(peer.lifecycle.changed, (type: EndpointLifecycle.Change) => {
      if (
        type === EndpointLifecycle.Change.PartsReady ||
        type === EndpointLifecycle.Change.ServersChanged ||
        type === EndpointLifecycle.Change.Destroying
      ) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void this.onPeerStructureChanged(peer);
        }, 500);
      }
    });
  }

  private async onPeerSeeded(peer: ClientNode): Promise<void> {
    const nodeId = peer.peerAddress?.nodeId;
    if (!nodeId) return;

    const matterBridge = await this.getMatterBridge(nodeId);

    if (this.addMatterBridgeHandler && matterBridge) {
      await this.addMatterBridgeHandler(matterBridge);
    }

    await this.flushStorage();
    log.info(`Node ${nodeId} successfully initialized`);
  }

  private async onPeerStructureChanged(peer: ClientNode): Promise<void> {
    const nodeId = peer.peerAddress?.nodeId;
    if (!nodeId) return;

    log.info(`Node ${nodeId} structure changed`);

    await this.flushStorage();

    const matterBridge = await this.getMatterBridge(nodeId);

    if (this.updateMatterBridgeHandler && matterBridge) {
      await this.updateMatterBridgeHandler(matterBridge);
    }
  }

  async start() {
    if (!this.serverNode || this.serverNodeStarted) return;

    await this.serverNode.start();

    this.startBackgroundRefreshTask();

    await this.flushStorage();

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

    // Use stop() (go offline) rather than close() (permanent teardown) so the same
    // ServerNode instance can be brought back online with start().
    await this.serverNode.stop();

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

    let nodeStructureLog: string | undefined;

    Logger.destinations.temp = LogDestination({
      write: (formattedLog: string) => {
        nodeStructureLog = formattedLog;
      },
      level: LogLevel.INFO,
      format: LogFormat("plain")
    });

    Logger.get("ClientNode").info(clientNode);
    delete Logger.destinations.temp;

    return nodeStructureLog;
  }

  async updateFabricLabel(label: string) {
    if (!this.fabric) return;

    // Update the local fabric label on the running fabric object.
    // Persistence across restarts is handled by driverConfig (the label is passed to
    // ServerNode.create via controller.adminFabricLabel on every init), so there is
    // no need to call setStateOf(ControllerBehavior) — which would crash if the
    // ControllerBehavior is still lazily initializing.
    await this.fabric.setLabel(label);

    if (!this.serverNode || !this.serverNodeStarted) return;

    // Push the new label to every currently-connected peer.
    for (const peer of this.serverNode.peers.commissioned) {
      if (!peer.lifecycle.isConnected) continue;

      try {
        const { statusCode } = await peer.act((agent) =>
          agent.get(OperationalCredentialsClient).updateFabricLabel({ label })
        );

        const { OperationalCredentials } = await import("@matter/main/clusters");
        if (statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
          log.warn(`UpdateFabricLabel on node ${peer.peerAddress?.nodeId} returned status ${statusCode}`);
        }
      } catch (e) {
        log.error(`Failed to push fabric label to node ${peer.peerAddress?.nodeId}:`, e);
      }
    }
  }

  getLogLevel(): LogLevel {
    return this.environment.vars.get("log.level");
  }

  setLogLevel(logLevel: LogLevel) {
    this.environment.vars.set("log.level", logLevel);
  }

  isCommissioned() {
    if (!this.serverNode) return false;

    return this.serverNode.peers.commissioned.length > 0;
  }

  isStarted() {
    if (!this.serverNode) return false;

    return this.serverNodeStarted;
  }

  isInitialized() {
    return !!this.serverNode;
  }

  /**
   * Look up a commissioned ClientNode by its Matter NodeId.
   */
  private getClientNodeById(nodeId: NodeId): ClientNode | undefined {
    if (!this.serverNode || !this.fabric) return undefined;

    return this.serverNode.peers.get(this.fabric.addressOf(nodeId));
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
      autoSubscribe: driverConfig.autoSubscribe
    });

    const nodeId = clientNode.peerAddress?.nodeId;

    if (!nodeId) {
      log.error("Commissioning completed but nodeId is undefined");
      return undefined;
    }

    log.info(`Commissioning successfully done with nodeId ${nodeId}`);

    console.timeEnd("Commissioning took");

    // The seeded lifecycle event (registered in watchPeer via peers.added) will call
    // addMatterBridgeHandler once the node's structure is ready.

    return nodeId;
  }

  /**
   * Apply the current autoSubscribe setting to all commissioned peers without restarting the node.
   * Called when the user changes the autoSubscribe preference in the driver configuration.
   */
  async reconfigureSubscriptions() {
    if (!this.serverNode) return;

    await this.backgroundRefreshTask.stop();

    for (const peer of this.serverNode.peers.commissioned) {
      try {
        await peer.setStateOf(NetworkClient, { autoSubscribe: driverConfig.autoSubscribe });
      } catch (e) {
        log.error(`Failed to reconfigure subscriptions for node ${peer.peerAddress?.nodeId}:`, e);
      }
    }

    this.startBackgroundRefreshTask();
  }

  /**
   * Re-establish subscriptions for all connected peers after a standby/wake cycle.
   * In subscribe mode, peers that are no longer Connected get a fresh subscription by toggling autoSubscribe.
   * In polling mode, the background refresh task handles attribute reads; nothing extra is needed.
   */
  async reconnectAllNodes() {
    if (!this.serverNode || !driverConfig.autoSubscribe) return;

    for (const peer of this.serverNode.peers.commissioned) {
      if (peer.lifecycle.isConnected) continue;

      try {
        // Toggle autoSubscribe off then on to trigger a fresh subscription attempt immediately.
        await peer.setStateOf(NetworkClient, { autoSubscribe: false });
        await peer.setStateOf(NetworkClient, { autoSubscribe: true });
      } catch (e) {
        log.error(`Failed to reconnect node ${peer.peerAddress?.nodeId}:`, e);
      }
    }
  }

  // Kept for backward-compat with driver.ts ExitStandby handler.
  async connectAllNodes() {
    return this.reconnectAllNodes();
  }

  async openEnhancedCommissioningWindow(nodeId: NodeId) {
    if (!this.serverNode) return undefined;

    try {
      const clientNode = this.getClientNodeById(nodeId);
      if (!clientNode) return undefined;

      return await clientNode.openEnhancedCommissioningWindow();
    } catch (e) {
      log.error(e);
    }

    return undefined;
  }

  async getMatterBridge(nodeId: NodeId): Promise<MatterBridge | undefined> {
    if (!this.serverNode) return undefined;

    const clientNode = this.getClientNodeById(nodeId);
    if (!clientNode) return undefined;

    const aggregatorEndpoint = clientNode.parts.get(1);
    if (!aggregatorEndpoint) return undefined;

    let biState = clientNode.maybeStateOf(BasicInformationClient);

    if (!biState) {
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
    const matterBridges: MatterBridge[] = [];

    if (!this.serverNode) return matterBridges;

    for (const peer of this.serverNode.peers.commissioned) {
      const nodeId = peer.peerAddress?.nodeId;
      if (!nodeId) continue;

      const matterBridge = await this.getMatterBridge(nodeId);

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

      await this.flushStorage();

      if (this.removeMatterBridgeHandler) {
        await this.removeMatterBridgeHandler(matterBridge);
      }

      // peerObservers are cleaned up via the peers.deleted handler registered in init().
    }
  }

  async reset() {
    if (!this.serverNode) return;

    // erase() is a self-contained factory reset: it cancels the running node, wipes storage,
    // reinitializes the node's services and restarts it if it was online. No need to close
    // and recreate — doing so would leave the Environment in an unresumable state.
    await this.serverNode.erase();

    // Close all peer observers; erase() will have torn down all commissioned peers.
    for (const group of this.peerObservers.values()) {
      group.close();
    }
    this.peerObservers.clear();

    if (this.removeMatterBridgeHandler) {
      await this.removeMatterBridgeHandler(null);
    }
  }

  async flushStorage() {
    if (this.serverNode && this.serverNode.env.has(ClientCacheBuffer)) {
      await this.serverNode.env.get(ClientCacheBuffer).flush();
    }

    if (this.redisStorage) await this.redisStorage.bgSave();
  }
}

const controllerNode = new ControllerNode();

export { MatterBridge, controllerNode };
