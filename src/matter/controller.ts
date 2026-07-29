import {
  Diagnostic,
  Environment,
  LogDestination,
  LogFormat,
  Logger,
  LogLevel,
  StorageService,
  Time
} from "@matter/main";
import { BasicInformation, GeneralCommissioning } from "@matter/main/clusters";
import { ManualPairingCodeCodec, NodeId } from "@matter/main/types";
import { AsyncObserver, Observer } from "@matter/general";
import { CommissioningController, NodeCommissioningOptions } from "@project-chip/matter.js";
import { Endpoint, PairedNode } from "@project-chip/matter.js/device";
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
  rootNode: PairedNode;
  aggregatorEndpoint: Endpoint;
  entityIdentifier: string;

  constructor(
    id: NodeId,
    vendorName: string,
    productName: string,
    label: string,
    rootNode: PairedNode,
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
  private commissioningController: CommissioningController | undefined;
  private commissioningControllerStarted: boolean = false;
  private addMatterBridgeHandler: ((matterBridge: MatterBridge) => Promise<void>) | null = null;
  private removeMatterBridgeHandler: ((matterBridge: MatterBridge | null) => Promise<void>) | null = null;
  private updateMatterBridgeHandler: ((matterBridge: MatterBridge) => Promise<void>) | null = null;
  private structureChangeListeners = new Map<NodeId, AsyncObserver<[void], void>>();

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
    if (this.commissioningController) return;

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

    /** Create Matter Controller Node and bind it to the Environment. */
    this.commissioningController = new CommissioningController({
      environment: {
        environment: this.environment,
        id: config.matterUniqueId
      },
      autoSubscribe: false,
      autoConnect: false, // Do not auto connect to the commissioned nodes
      adminFabricLabel: config.matterFabricLabel
    });

    log.info(`node-matter Controller initialized`);

    return true;
  }

  async start() {
    if (!this.commissioningController || this.commissioningControllerStarted) return;

    /** Start the Matter Controller Node */
    await this.commissioningController.start();

    // Connect to all commissioned nodes
    await this.connectAllNodes();

    this.startBackgroundRefreshTask();

    if (this.redisStorage) await this.redisStorage.bgSave();

    this.commissioningControllerStarted = true;

    log.info(`node-matter Controller started`);
  }

  startBackgroundRefreshTask() {
    if (!driverConfig.autoSubscribe) {
      this.setBackgroundRefreshTaskInterval(driverConfig.backgroundRefreshInterval);
      this.backgroundRefreshTask.start();
    }
  }

  async stop() {
    if (!this.commissioningController) return;

    await this.backgroundRefreshTask.stop();

    /** Stop the Matter Controller Node */
    await this.commissioningController.close();

    this.commissioningControllerStarted = false;

    log.info(`node-matter Controller stopped`);
  }

  async stopBackgroundRefreshTask() {
    return this.backgroundRefreshTask.stop();
  }

  setBackgroundRefreshTaskInterval(interval: number) {
    this.backgroundRefreshTask.setInterval(interval * 1000);
  }

  async getNodeStructure(nodeId: NodeId) {
    if (!this.commissioningController) return undefined;

    let node = await this.commissioningController.getNode(nodeId);
    let nodeStructureLog: string | undefined;

    Logger.destinations.temp = LogDestination({
      write: (formattedLog: string) => {
        nodeStructureLog = formattedLog;
      },
      level: LogLevel.INFO,
      format: LogFormat("plain")
    });

    node.logStructure();
    delete Logger.destinations.temp;

    return nodeStructureLog;
  }

  async updateFabricLabel(label: string) {
    if (!this.commissioningController) return;

    await this.commissioningController.updateFabricLabel(label);
  }

  getLogLevel(): LogLevel {
    return this.environment.vars.get("log.level");
  }

  setLogLevel(logLevel: LogLevel) {
    this.environment.vars.set("log.level", logLevel);
  }

  isCommissioned() {
    if (!this.commissioningController) return false;

    return this.commissioningController.isCommissioned();
  }

  isStarted() {
    if (!this.commissioningController) return false;

    return this.commissioningControllerStarted;
  }

  isInitialized() {
    return !!this.commissioningController;
  }

  async pair(pairingCode: string): Promise<NodeId | undefined> {
    if (!this.commissioningController) return undefined;

    // Collect commissioning options from commandline parameters
    const commissioningOptions: NodeCommissioningOptions["commissioning"] = {
      regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
      regulatoryCountryCode: "XX"
    };

    let longDiscriminator, setupPin, shortDiscriminator;
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

    const options: NodeCommissioningOptions = {
      commissioning: commissioningOptions,
      discovery: {
        identifierData:
          longDiscriminator !== undefined
            ? { longDiscriminator }
            : shortDiscriminator !== undefined
              ? { shortDiscriminator }
              : {},
        discoveryCapabilities: { onIpNetwork: true }
      },
      passcode: setupPin
    };

    console.time("Commissioning took");

    log.info(`Commissioning ... ${Diagnostic.json(options)}`);
    let nodeId = await this.commissioningController.commissionNode(options, { connectNodeAfterCommissioning: false });

    log.info(`Commissioning successfully done with nodeId ${nodeId}`);

    let node = await this.commissioningController.getNode(nodeId);

    if (node) {
      void node.events.initializedFromRemote.then(async () => {
        var matterBridge = await this.getMatterBridge(nodeId);

        if (this.addMatterBridgeHandler && matterBridge) {
          await this.addMatterBridgeHandler(matterBridge);
        }

        if (this.redisStorage) await this.redisStorage.bgSave();

        console.timeEnd("Commissioning took");
        log.info(`Node ${nodeId} successfully initialized`);
        node.logStructure();
      });

      this.connectPairedNode(node);

      return nodeId;
    } else {
      log.info(`Node ${nodeId} not connecting`);
    }

    return undefined;
  }

  async connectAllNodes() {
    if (!this.commissioningController) return;

    for (const nodeId of this.commissioningController.getCommissionedNodes()) {
      try {
        let node = await this.commissioningController.getNode(nodeId);
        this.connectPairedNode(node);
      } catch (e) {
        log.error(e);
      }
    }
  }

  async disconnectAllNodes() {
    if (!this.commissioningController) return;

    for (const nodeId of this.commissioningController.getCommissionedNodes()) {
      try {
        let node = await this.commissioningController.getNode(nodeId);
        log.debug(`Disconnecting node ${node.id}`);
        await node.disconnect();
        log.debug(`Node ${node.id} disconnected.`);
      } catch (e) {
        log.error(e);
      }
    }
  }

  connectPairedNode(node: PairedNode) {
    if (!this.commissioningController) return;

    node.connect({ autoSubscribe: driverConfig.autoSubscribe });

    let structureChangedListener = this.structureChangeListeners.get(node.nodeId);

    if (!structureChangedListener) {
      structureChangedListener = async () => {
        log.info(`Node ${node.nodeId} structure changed`);

        if (this.redisStorage) await this.redisStorage.bgSave();

        var matterBridge = await this.getMatterBridge(node.nodeId);

        if (this.updateMatterBridgeHandler && matterBridge) {
          await this.updateMatterBridgeHandler(matterBridge);
        }
      };

      node.events.structureChanged.on(structureChangedListener as Observer<[void], void>);

      this.structureChangeListeners.set(node.nodeId, structureChangedListener);
    }
  }

  async openEnhancedCommissioningWindow(nodeId: NodeId) {
    if (!this.commissioningController) return undefined;

    try {
      let node = await this.commissioningController.getNode(nodeId);
      return await node.openEnhancedCommissioningWindow();
    } catch (e) {
      log.error(e);
    }

    return undefined;
  }

  async getMatterBridge(nodeId: NodeId): Promise<MatterBridge | undefined> {
    if (!this.commissioningController) return undefined;

    const rootNode = await this.commissioningController.getNode(nodeId);
    const aggregatorEndpoint = rootNode.getDeviceById(1);
    const basicInformationClient = rootNode.getRootClusterClient(BasicInformation);

    if (!aggregatorEndpoint || !basicInformationClient) return undefined;

    const vendorName = await basicInformationClient.getVendorNameAttribute();
    const productName = await basicInformationClient.getProductNameAttribute();
    const label = await basicInformationClient.getNodeLabelAttribute();

    return new MatterBridge(rootNode.nodeId, vendorName, productName, label, rootNode, aggregatorEndpoint);
  }

  async getMatterBridges(): Promise<MatterBridge[]> {
    var matterBridges: MatterBridge[] = [];

    if (!this.commissioningController) return matterBridges;

    for (const nodeId of this.commissioningController.getCommissionedNodes()) {
      var matterBridge = await this.getMatterBridge(nodeId);

      if (matterBridge) {
        matterBridges.push(matterBridge);
      }
    }

    return matterBridges;
  }

  async removeNode(nodeId: NodeId, forceRemove: boolean) {
    if (!this.commissioningController) return;

    var matterBridge = await this.getMatterBridge(nodeId);

    if (matterBridge) {
      try {
        await matterBridge.rootNode.decommission();
      } catch (e) {
        if (forceRemove) {
          await this.commissioningController.removeNode(nodeId, false);
        } else {
          throw e;
        }
      }

      if (this.redisStorage) await this.redisStorage.bgSave();

      if (this.removeMatterBridgeHandler) {
        await this.removeMatterBridgeHandler(matterBridge);
      }

      let structureChangedListener = this.structureChangeListeners.get(matterBridge.rootNode.nodeId);

      if (structureChangedListener) {
        matterBridge.rootNode.events.structureChanged.off(structureChangedListener as Observer<[void], void>);
        this.structureChangeListeners.delete(matterBridge.rootNode.nodeId);
      }
    }
  }

  async reset() {
    if (!this.commissioningController) return;

    for (let commissionedNodeId of this.commissioningController.getCommissionedNodes()) {
      let rootNode = await this.commissioningController.getNode(commissionedNodeId);

      try {
        // Try to decommission all nodes
        await rootNode.decommission();
      } catch (e) {
        // Ignore errors because we reset everything
        log.error(e);
      }

      let structureChangedListener = this.structureChangeListeners.get(rootNode.nodeId);

      if (structureChangedListener) {
        rootNode.events.structureChanged.off(structureChangedListener as Observer<[void], void>);
      }
    }

    await this.stop();
    await this.commissioningController.resetStorage();

    if (this.removeMatterBridgeHandler) {
      await this.removeMatterBridgeHandler(null);
    }

    await this.start();
  }
}

const controllerNode = new ControllerNode();

export { MatterBridge, controllerNode };
