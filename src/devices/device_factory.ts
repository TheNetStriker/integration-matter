import * as matter from "../matter/controller.js";
import { Descriptor } from "@matter/main/clusters";
import { Endpoint } from "@project-chip/matter.js/device";
import { Entity } from "@unfoldedcircle/integration-api";

import log from "../loggers.js";
import { driver } from "../driver.js";
import { BaseDevice, DeviceInfo, MatterLightTypes, MatterSwitchTypes } from "./base_device.js";
import { SwitchDevice } from "./switch_device.js";
import { LightDevice } from "./light_device.js";
import { MatterBridge } from "../matter/controller.js";

interface MatterBridgeDevices {
  bridge: matter.MatterBridge;
  devices: Map<string, BaseDevice>;
}

/**
 * Configured Matter bridges.
 * @type {Map<string, MatterBridgeDevices>}
 */
const configuredDevices: Map<string, MatterBridgeDevices> = new Map<string, MatterBridgeDevices>();
const subscribedEntities = new Map<string, boolean>();

const createDevice = async function (endpoint: Endpoint, matterBridge: MatterBridge, deviceInfo: DeviceInfo) {
  const deviceType = endpoint.deviceType.valueOf();
  let device: BaseDevice;
  let entity: Entity;

  if (MatterSwitchTypes.has(deviceType)) {
    entity = await SwitchDevice.initUcEntity(endpoint, deviceInfo);
    device = new SwitchDevice(endpoint, matterBridge, deviceInfo, entity);
  } else if (MatterLightTypes.has(deviceType)) {
    entity = await SwitchDevice.initUcEntity(endpoint, deviceInfo);
    device = new LightDevice(endpoint, matterBridge, deviceInfo, entity);
  } else {
    throw new Error(`Matter device type id ${deviceType} not supported at the moment.`);
  }

  entity.attributes = await device.getEntityAttributes({
    initFromMatterCache: true,
    requestFromRemote: false,
    onlyReturnChangedAttributes: false
  });

  entity.setCmdHandler(device.entityCmdHandler.bind(device));

  return device;
};

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

  let matterBridgeDevices: MatterBridgeDevices = { bridge: matterBridge, devices: new Map<string, BaseDevice>() };

  for (const endpoint of nodeEndpoints) {
    let matterDevice: BaseDevice | undefined = undefined;

    try {
      let matterDeviceInfo = await BaseDevice.initDeviceInfo(endpoint, matterBridge);
      matterDevice = await createDevice(endpoint, matterBridge, matterDeviceInfo);
    } catch (e) {
      log.error(e);
      continue;
    }

    if (matterDevice.entity && addEntites) {
      matterDevice.addAvailableEntity();
    }

    if (matterDevice.entity && matterDevice.deviceInfo.entityIdentifier) {
      matterBridgeDevices.devices.set(matterDevice.deviceInfo.entityIdentifier, matterDevice);

      if (subscribedEntities.get(matterDevice.entity.id)) {
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
        if (device.deviceInfo.entityId && removeEntites) {
          configuredEntities.removeEntity(device.deviceInfo.entityId);
          availableEntities.removeEntity(device.deviceInfo.entityId);
          subscribedEntities.delete(device.deviceInfo.entityId);
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
        oldMatterDevice.endpoint.deviceType.valueOf() != newMatterDevice.endpoint.deviceType.valueOf()
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

export {
  MatterBridgeDevices,
  configuredDevices,
  subscribedEntities,
  getConfiguredMatterBridgeByEntityId,
  onMatterBridgeAdded,
  onMatterBridgeRemoved,
  onMatterBridgeUpdated
};
