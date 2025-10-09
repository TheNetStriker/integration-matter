import * as uc from "@unfoldedcircle/integration-api";
import * as fs from "fs";
import * as path from "path";

import log from "./loggers.js";
import { driverConfig } from "./config.js";
import { driverSetupHandler } from "./setup_flow.js";
import * as matter from "./matter_controller.js";
import {
  getConfiguredMatterBridgeByEntityId,
  onMatterBridgeAdded,
  onMatterBridgeRemoved,
  onMatterBridgeUpdated,
  subscribedEntities
} from "./devices/device_factory.js";

const driver = new uc.IntegrationAPI();

const isRunningOnRemote = process.env.UC_MODEL != undefined;

driver.on(uc.Events.Connect, async () => {
  await driver.setDeviceState(uc.DeviceStates.Connected);
});

driver.on(uc.Events.Disconnect, async () => {
  await driver.setDeviceState(uc.DeviceStates.Disconnected);
});

driver.on(uc.Events.EnterStandby, async () => {
  log.debug("Enter standby event.");
});

driver.on(uc.Events.ExitStandby, async () => {
  log.debug("Exit standby event%s.", isRunningOnRemote ? ", checking for new entity values" : "");

  // If we are running on the remote we have outdated values
  // We have to get fresh values from the matter bridge.
  if (isRunningOnRemote) {
    for (const [entityId, subscribed] of subscribedEntities) {
      try {
        if (subscribed) {
          log.debug(`Getting new values after standby for entity: ${entityId}`);

          let { matterDevice } = getConfiguredMatterBridgeByEntityId(entityId);

          if (matterDevice) {
            await matterDevice.sendAttributes({
              initFromMatterCache: false,
              requestFromRemote: true,
              onlyReturnChangedAttributes: true
            });
            log.debug(`Got new values after standby for entity: ${entityId}`);
          }
        }
      } catch (e) {
        log.error(e);
      }
    }
  }
});

driver.on(uc.Events.SubscribeEntities, async (entityIds: string[]) => {
  for (const entityId of entityIds) {
    let { matterDevice } = getConfiguredMatterBridgeByEntityId(entityId);

    if (matterDevice) {
      matterDevice.addAttributeListeners();
      await matterDevice.sendAttributes({
        initFromMatterCache: false,
        requestFromRemote: false,
        onlyReturnChangedAttributes: false
      });
    }

    subscribedEntities.set(entityId, true);
    log.debug(`Subscribed entity: ${entityId}`);
  }
});

driver.on(uc.Events.UnsubscribeEntities, async (entityIds: string[]) => {
  for (const entityId of entityIds) {
    let { matterDevice } = getConfiguredMatterBridgeByEntityId(entityId);

    if (matterDevice) {
      matterDevice.removeAttributeListeners();
    }

    subscribedEntities.set(entityId, false);
    log.debug(`Unsubscribed entity: ${entityId}`);
  }
});

async function initializeAndStartMatterController(initalizeConfig: boolean) {
  var controllerInitialized = await matter.controllerNode.init(
    initalizeConfig,
    onMatterBridgeAdded,
    onMatterBridgeRemoved,
    onMatterBridgeUpdated
  );

  if (controllerInitialized) {
    await matter.controllerNode.start();

    if (matter.controllerNode.isCommissioned()) {
      var matterBridges = await matter.controllerNode.getMatterBridges();

      for (const matterBridge of matterBridges) {
        await onMatterBridgeAdded(matterBridge);
      }
    }
  }
}

function checkConfigReset() {
  // Check if reset file exists in config directory and delete everything in data directory.
  if (process.env.UC_CONFIG_HOME && process.env.UC_DATA_HOME) {
    const resetFile = path.join(process.env.UC_CONFIG_HOME, "reset");

    if (fs.existsSync(resetFile)) {
      log.warn("Reset file exists, deleting existing configuraton.");

      for (const entry of fs.readdirSync(process.env.UC_DATA_HOME)) {
        fs.rmSync(path.join(process.env.UC_DATA_HOME, entry), { recursive: true, force: true });
      }

      fs.rmSync(resetFile);
    }
  }
}

async function main() {
  try {
    checkConfigReset();

    let dataDirPath = process.env.UC_DATA_HOME || "./";
    driverConfig.init(dataDirPath);
    driverConfig.setLogLevels();

    await initializeAndStartMatterController(false);

    driver.init("driver.json", driverSetupHandler);

    const info = driver.getDriverVersion();
    log.info("Matter integration %s started%s", info.version.driver, isRunningOnRemote ? " on remote" : "");
  } catch (e) {
    log.error(e);
  }
}

export { driver, initializeAndStartMatterController };

// Execute the main function if the module is run directly
if (import.meta.url === new URL("", import.meta.url).href) {
  await main();
}
