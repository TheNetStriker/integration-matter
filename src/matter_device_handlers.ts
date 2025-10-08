import * as uc from "@unfoldedcircle/integration-api";

import log from "./loggers.js";
import * as matter from "./matter_controller.js";
import { MatterDevice } from "./matter_device.js";
import { driver } from "./driver.js";
import { driverConfig } from "./config.js";
import { Descriptor } from "@matter/main/clusters";

interface MatterBridgeDevices {
  bridge: matter.MatterBridge;
  devices: Map<string, MatterDevice>;
}

/**
 * Configured Matter bridges.
 * @type {Map<string, MatterBridgeDevices>}
 */
const configuredDevices: Map<string, MatterBridgeDevices> = new Map<string, MatterBridgeDevices>();
const subscribedEntities = new Map<string, boolean>();

const getConfiguredMatterBridgeByEntityId = function (entityId: string) {
  var entityIdSplit = entityId.split("|");
  var bridgeId = entityIdSplit[0];
  var deviceId = entityIdSplit[1];

  const matterBridge = configuredDevices.get(bridgeId);
  const matterDevice = matterBridge?.devices.get(deviceId);

  return { matterBridge, matterDevice };
};

/**
 * Handle a newly added matter bridge.
 * @param {MatterBridge} matterBridge
 */
async function onMatterBridgeAdded(matterBridge: matter.MatterBridge) {
  log.debug("New matter bridge added:", matterBridge.label);
  return addMatterBridge(matterBridge, true);
}

async function addMatterBridge(matterBridge: matter.MatterBridge, addEntites: boolean) {
  const nodeEndpoints = matterBridge.aggregatorEndpoint.getChildEndpoints();
  const aggregatorEndpointDescriptor = matterBridge.aggregatorEndpoint.getClusterClient(Descriptor.Complete);

  if (!nodeEndpoints || !aggregatorEndpointDescriptor) {
    return undefined;
  }

  let aggregatorEndpointPartsList = aggregatorEndpointDescriptor.getPartsListAttributeFromCache();

  let matterBridgeDevices: MatterBridgeDevices = { bridge: matterBridge, devices: new Map<string, MatterDevice>() };

  for (const endpoint of nodeEndpoints) {
    // Workarround for not removed nodes.
    if (aggregatorEndpointPartsList && !aggregatorEndpointPartsList.find((x) => endpoint.number == x.valueOf())) {
      continue;
    }

    let matterDevice: MatterDevice | undefined = undefined;

    try {
      matterDevice = new MatterDevice(endpoint);
      await matterDevice.init(matterBridge);
    } catch (e) {
      log.error(e);
      continue;
    }

    let entity = await matterDevice.getUcEntity();

    if (entity && addEntites) {
      matterDevice.addAvailableEntity();
    }

    if (entity && matterDevice.entityIdentifier) {
      matterBridgeDevices.devices.set(matterDevice.entityIdentifier, matterDevice);

      if (subscribedEntities.get(entity.id)) {
        matterDevice.addAttributeListeners();
      }
    }
  }

  configuredDevices.set(matterBridge.label.replace(" ", "_"), matterBridgeDevices);
}

/**
 * Handle a removed matter bridge.
 * @param {MatterBridge | null} matterBridge
 */
async function onMatterBridgeRemoved(matterBridge: matter.MatterBridge | null) {
  return removeMatterBridge(matterBridge, true);
}

async function removeMatterBridge(matterBridge: matter.MatterBridge | null, removeEntites: boolean) {
  if (matterBridge === null) {
    log.debug("Configuration cleared, disconnecting & removing all configured matter devices.");

    for (let [, matterBridgeDevices] of configuredDevices.entries()) {
      for (let [, device] of matterBridgeDevices.devices.entries()) {
        device.removeAttributeListeners();
      }
    }

    configuredDevices.clear();
    driver.clearConfiguredEntities();
    driver.clearAvailableEntities();
  } else {
    var configuredMatterBridge = configuredDevices.get(matterBridge.entityIdentifier);

    if (configuredMatterBridge) {
      var configuredEntities = driver.getConfiguredEntities();
      var availableEntities = driver.getAvailableEntities();

      for (let [key, device] of configuredMatterBridge.devices.entries()) {
        if (device.entityId && removeEntites) {
          configuredEntities.removeEntity(device.entityId);
          availableEntities.removeEntity(device.entityId);
          subscribedEntities.delete(device.entityId);
        }

        device.removeAttributeListeners();
      }

      configuredDevices.delete(matterBridge.label.toString());
    }
  }
}

/**
 * Handle an updated matter bridge.
 * @param {MatterBridge} updatedMatterBridge
 */
async function onMatterBridgeUpdated(updatedMatterBridge: matter.MatterBridge) {
  log.debug("Matter bridge updated:", updatedMatterBridge.label);

  var configuredMatterBridge = configuredDevices.get(updatedMatterBridge.entityIdentifier);
  var configuredEntities = driver.getConfiguredEntities();
  var availableEntities = driver.getAvailableEntities();

  await removeMatterBridge(updatedMatterBridge, false);
  await addMatterBridge(updatedMatterBridge, false);

  var updatedMatterBridgeDevices = configuredDevices.get(updatedMatterBridge.entityIdentifier);

  if (configuredMatterBridge && updatedMatterBridgeDevices) {
    const configuredDeviceIds = configuredMatterBridge.devices.keys();
    const updatedDeviceIds = updatedMatterBridgeDevices.devices.keys();
    const compareDeviceIds = diffKeys(configuredDeviceIds, updatedDeviceIds);

    for (let deviceId of compareDeviceIds.added) {
      let addedMatterDevice = updatedMatterBridgeDevices.devices.get(deviceId);

      if (addedMatterDevice && addedMatterDevice.entity) {
        addedMatterDevice.addAvailableEntity();
      }
    }

    for (let deviceId of compareDeviceIds.removed) {
      let removedMatterDevice = configuredMatterBridge.devices.get(deviceId);

      if (removedMatterDevice && removedMatterDevice.entity) {
        configuredEntities.removeEntity(removedMatterDevice.entity.id);
        availableEntities.removeEntity(removedMatterDevice.entity.id);
        subscribedEntities.delete(removedMatterDevice.entity.id);
      }
    }

    for (let deviceId of compareDeviceIds.unchanged) {
      let oldMatterDevice = configuredMatterBridge.devices.get(deviceId);
      let newMatterDevice = updatedMatterBridgeDevices.devices.get(deviceId);

      if (
        oldMatterDevice &&
        newMatterDevice &&
        newMatterDevice.entity &&
        oldMatterDevice.endpointDeviceTypeId.valueOf() != newMatterDevice.endpointDeviceTypeId.valueOf()
      ) {
        configuredEntities.removeEntity(newMatterDevice.entity.id);
        availableEntities.removeEntity(newMatterDevice.entity.id);

        newMatterDevice.addAvailableEntity();
      }
    }
  }
}

function diffKeys(oldKeys: Iterable<string>, newKeys: Iterable<string>) {
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);

  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  for (const key of newSet) {
    if (!oldSet.has(key)) {
      added.push(key);
    } else {
      unchanged.push(key);
    }
  }

  for (const key of oldSet) {
    if (!newSet.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, unchanged };
}

/**
 * Matter switch command handler.
 *
 * Called by the integration-API if a command is sent to a configured entity.
 *
 * @param entity button entity
 * @param cmdId command
 * @param params optional command parameters
 * @return status of the command
 */
const switchCmdHandler: uc.CommandHandler = async function (
  entity: uc.Entity,
  cmdId: string,
  params?: {
    [key: string]: string | number | boolean | string[];
  }
) {
  log.debug("Got %s command request: %s params: %s", entity.id, cmdId, params);

  let { matterBridge, matterDevice } = getConfiguredMatterBridgeByEntityId(entity.id);

  if (!matterDevice || !matterDevice.onOffClient) {
    return uc.StatusCodes.NotFound;
  }

  if (matterBridge && !matterBridge.bridge.rootNode.isConnected) {
    return uc.StatusCodes.ServiceUnavailable;
  }

  try {
    switch (cmdId) {
      case uc.LightCommands.Toggle:
        matterDevice.onOffClient.toggle();
        break;
      case uc.LightCommands.On:
        matterDevice.onOffClient.on();
        break;
      case uc.LightCommands.Off:
        matterDevice.onOffClient.off();
        break;
      default:
        return uc.StatusCodes.NotImplemented;
    }
  } catch (e) {
    log.error(e);
    return uc.StatusCodes.ServiceUnavailable;
  }

  return uc.StatusCodes.Ok;
};

/**
 * Matter light command handler.
 *
 * Called by the integration-API if a command is sent to a configured entity.
 *
 * @param entity button entity
 * @param cmdId command
 * @param params optional command parameters
 * @return status of the command
 */
const lightCmdHandler: uc.CommandHandler = async function (
  entity: uc.Entity,
  cmdId: string,
  params?: {
    [key: string]: string | number | boolean | string[];
  }
) {
  log.debug("Got %s command request: %s params: %s", entity.id, cmdId, params);

  let { matterBridge, matterDevice } = getConfiguredMatterBridgeByEntityId(entity.id);

  if (!matterDevice) {
    return uc.StatusCodes.NotFound;
  }

  if (matterBridge && !matterBridge.bridge.rootNode.isConnected) {
    return uc.StatusCodes.ServiceUnavailable;
  }

  try {
    switch (cmdId) {
      case uc.LightCommands.Toggle:
        if (!matterDevice.onOffClient) return uc.StatusCodes.NotFound;
        matterDevice.onOffClient.toggle();
        break;
      case uc.LightCommands.On:
        if (matterDevice.onOffClient && params?.brightness == 0) {
          // We have a brightness parameter of 0, turn the light off.
          matterDevice.onOffClient.off();
          break;
        }

        if (params?.brightness && matterDevice.onOffClient?.getOnOffAttributeFromCache() == false) {
          // We have a brightness parameter and the light is currently off. Turn  the light on first.
          await matterDevice.onOffClient.on();
        }

        if (matterDevice.levelControlClient && typeof params?.brightness === "number") {
          await matterDevice.levelControlClient.moveToLevel({
            level: matterDevice.ucLevelToMatter(params.brightness),
            transitionTime: driverConfig.get().lightTransitionTime,
            optionsMask: {},
            optionsOverride: {}
          });
          break;
        }

        if (matterDevice.colorControlClient && typeof params?.color_temperature === "number") {
          await matterDevice.colorControlClient.moveToColorTemperature({
            colorTemperatureMireds: matterDevice.percentToMired(params.color_temperature),
            transitionTime: driverConfig.get().lightTransitionTime,
            optionsMask: {},
            optionsOverride: {}
          });
          break;
        }

        if (
          matterDevice.colorControlClient &&
          typeof params?.hue === "number" &&
          typeof params?.saturation === "number"
        ) {
          await matterDevice.colorControlClient.moveToHueAndSaturation({
            hue: matterDevice.ucHueToMatter(params.hue),
            saturation: matterDevice.ucSaturationToMatter(params.saturation),
            transitionTime: driverConfig.get().lightTransitionTime,
            optionsMask: {},
            optionsOverride: {}
          });
          break;
        } else {
          if (!matterDevice.onOffClient) return uc.StatusCodes.NotFound;
          matterDevice.onOffClient.on();
          break;
        }
      case uc.LightCommands.Off:
        if (!matterDevice.onOffClient) return uc.StatusCodes.NotFound;
        matterDevice.onOffClient.off();
        break;
      default:
        return uc.StatusCodes.NotImplemented;
    }
  } catch (e) {
    log.error(e);
    return uc.StatusCodes.ServiceUnavailable;
  }

  return uc.StatusCodes.Ok;
};

export {
  MatterBridgeDevices,
  configuredDevices,
  subscribedEntities,
  getConfiguredMatterBridgeByEntityId,
  onMatterBridgeAdded,
  onMatterBridgeRemoved,
  onMatterBridgeUpdated,
  switchCmdHandler,
  lightCmdHandler
};
