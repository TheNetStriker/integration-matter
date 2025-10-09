import * as uc from "@unfoldedcircle/integration-api";
import { BridgedDeviceBasicInformation } from "@matter/main/clusters";
import { Endpoint } from "@project-chip/matter.js/device";

import log from "../loggers.js";
import { driver } from "../driver.js";
import { MatterBridge } from "../matter_controller.js";
import { MatterHelpers } from "../matter_helpers.js";

export enum MatterDeviceType {
  PowerSource = 17,
  BridgedNode = 19,
  ElectricalSensor = 1296,
  OnOffLight = 256,
  DimmableLight = 257,
  ColorTemperatureLight = 268,
  ExtendedColorLight = 269,
  OnOffPlugInUnit = 266,
  DimmablePlugInUnit = 267,
  MountedOnOffControl = 271,
  MountedDimmableLoadControl = 272,
  OnOffLightSwitch = 259,
  DimmerSwitch = 260,
  ColorDimmerSwitch = 261,
  GenericSwitch = 15,
  ContactSensor = 21,
  LightSensor = 262,
  OccupancySensor = 263,
  TemperatureSensor = 770,
  HumiditySensor = 775,
  OnOffSensor = 2128,
  AirQualitySensor = 44,
  WaterFreezeDetector = 65,
  WaterLeakDetector = 67,
  RainSensor = 68,
  DoorLock = 10,
  WindowCovering = 514,
  Thermostat = 769,
  Fan = 43,
  AirPurifier = 45,
  RoboticVacuumCleaner = 116,
  RoomAirConditioner = 114,
  SolarPower = 23,
  BatteryStorage = 24,
  ThreadBorderRouter = 145
}

export const MatterSwitchTypes = new Set([MatterDeviceType.GenericSwitch, MatterDeviceType.OnOffPlugInUnit]);

export interface GetEntityAttributeOptions {
  initFromMatterCache: boolean;
  requestFromRemote: boolean;
  onlyReturnChangedAttributes: boolean;
}

export const MatterLightTypes = new Set([
  MatterDeviceType.OnOffLight,
  MatterDeviceType.ExtendedColorLight,
  MatterDeviceType.OnOffLightSwitch,
  MatterDeviceType.ColorTemperatureLight,
  MatterDeviceType.DimmableLight
]);

export interface DeviceInfo {
  endpointProductName: string | undefined;
  endpointLabel: string | undefined;
  endpointSerialNumber: string | undefined;

  entityIdentifier: string;
  entityId: string;
  entityLabel: string;
}

export abstract class BaseDevice {
  matterBridge: MatterBridge;
  endpoint: Endpoint;
  deviceInfo: DeviceInfo;

  entity: uc.Entity | undefined;
  entityAttributes: { [key: string]: string | number | boolean | string[] } = {};

  attributeListenersAdded: boolean = false;
  attributeListeners: Array<{ listener: (...args: any[]) => void; removeMethod: (listener: any) => void }> = [];

  constructor(endpoint: Endpoint, matterBridge: MatterBridge, deviceInfo: DeviceInfo) {
    this.endpoint = endpoint;
    this.matterBridge = matterBridge;
    this.deviceInfo = deviceInfo;
  }

  public abstract addAttributeListeners(): void;
  public abstract initUcEntity(): Promise<void>;
  protected abstract getEntityAttributes(
    options: GetEntityAttributeOptions
  ): Promise<{ [key: string]: string | number | boolean }>;

  public static async initDeviceInfo(endpoint: Endpoint, matterBridge: MatterBridge): Promise<DeviceInfo> {
    const bridgedDeviceBasicInformationClient =
      endpoint.getClusterClient(BridgedDeviceBasicInformation.Complete) ??
      (() => {
        throw new Error("No BridgedDeviceBasicInformation.");
      })();

    const endpointProductName = await bridgedDeviceBasicInformationClient.getProductNameAttribute();
    const endpointLabel = await bridgedDeviceBasicInformationClient.getNodeLabelAttribute();
    const endpointSerialNumber = await bridgedDeviceBasicInformationClient.getSerialNumberAttribute();
    let entityIdentifier: string;
    let entityLabel: string;

    if (matterBridge.vendorName == "openHAB" && endpointProductName) {
      entityIdentifier = endpointProductName.replace(" ", "_");
    } else if (matterBridge.productName == "MatterHub" && endpointSerialNumber) {
      entityIdentifier = endpointSerialNumber.toString();
    } else {
      entityIdentifier = endpoint.number!.toString();
    }

    const entityId = `${matterBridge.entityIdentifier}|${entityIdentifier}`;

    if (endpointLabel) {
      entityLabel = `${matterBridge.label}: ${endpointLabel}`;
    } else {
      entityLabel = `${matterBridge.label}: ${endpoint.number!}`;
    }

    return {
      endpointProductName: endpointProductName,
      endpointLabel: endpointLabel,
      endpointSerialNumber: endpointSerialNumber,
      entityIdentifier: entityIdentifier,
      entityId: entityId,
      entityLabel: entityLabel
    };
  }

  removeAttributeListeners() {
    if (!this.attributeListenersAdded) return;

    log.debug(`removeAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    for (const attributeListener of this.attributeListeners) {
      attributeListener.removeMethod(attributeListener.listener);
    }

    this.attributeListeners = [];

    this.attributeListenersAdded = false;
  }

  protected async getEntityAttribute(options: GetEntityAttributeOptions, entityAttribute: string) {
    if (!this.entity || !this.entity.entity_type) return;

    let getattribute = MatterHelpers.getAttribute(this.entity.entity_type, entityAttribute, this.endpoint);
    let getAttributeFromCache = MatterHelpers.getAttributeFromCache(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint
    );

    let matterToUcStateConverter = MatterHelpers.getMatterToUcStateConverter(this.entity.entity_type, entityAttribute);

    if (!getattribute || !getAttributeFromCache || !matterToUcStateConverter) return;

    let cachedValue = options.initFromMatterCache
      ? matterToUcStateConverter(getAttributeFromCache())
      : this.entityAttributes[entityAttribute];

    if (options.requestFromRemote) {
      let remoteValue = matterToUcStateConverter(await getattribute(options.requestFromRemote));

      if (cachedValue != remoteValue || !options.onlyReturnChangedAttributes) {
        let entityAttributeCapitalized = entityAttribute.toUpperCase() + entityAttribute.slice(1);
        log.debug(
          `${entityAttributeCapitalized} changed from ${cachedValue} to ${remoteValue} on entity ${this.deviceInfo.entityId}.`
        );
        return remoteValue;
      }
    } else if (cachedValue != undefined) {
      log.debug(`Send cached ${entityAttribute} value ${cachedValue} on entity ${this.deviceInfo.entityId}.`);
      return cachedValue;
    }
  }

  async sendAttributes(options: GetEntityAttributeOptions) {
    if (!this.deviceInfo.entityId) {
      throw new Error("MatterDevice not initialized");
    }

    if (!this.attributeListenersAdded || !this.entity) return;

    let entityAttributes = await this.getEntityAttributes(options);

    if (Object.keys(entityAttributes).length) {
      this.updateEntityAttributes(entityAttributes);
    }
  }

  updateEntityAttributes(attributes: { [key: string]: string | number | boolean }) {
    if (!this.deviceInfo.entityId) {
      throw new Error("MatterDevice not initialized");
    }

    if (driver.updateEntityAttributes(this.deviceInfo.entityId, attributes)) {
      this.updateCachedEntityAttributes(attributes);
    }
  }

  updateCachedEntityAttributes(attributes: { [key: string]: string | number | boolean | string[] }) {
    for (const [key, value] of Object.entries(attributes)) {
      this.entityAttributes[key] = value;
    }
  }

  addAvailableEntity() {
    if (!this.entity) return false;

    if (this.entity.attributes) {
      this.updateCachedEntityAttributes(this.entity.attributes);
    }

    driver.addAvailableEntity(this.entity);

    return true;
  }
}
