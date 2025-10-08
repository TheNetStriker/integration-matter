import * as uc from "@unfoldedcircle/integration-api";
import { BridgedDeviceBasicInformation, ColorControl, LevelControl, OnOff } from "@matter/main/clusters";
import { ClusterClientObj } from "@matter/main/protocol";
import { Endpoint } from "@project-chip/matter.js/device";
import { DeviceTypeId } from "@matter/main";

import log from "./loggers.js";
import { driver } from "./driver.js";
import { MatterBridge } from "./matter_controller.js";
import { lightCmdHandler, switchCmdHandler } from "./matter_device_handlers.js";

enum MatterDeviceType {
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

const MatterSwitchTypes = new Set([MatterDeviceType.GenericSwitch, MatterDeviceType.OnOffPlugInUnit]);

export interface GetEntityAttributeOptions {
  initFromMatterCache: boolean;
  requestFromRemote: boolean;
  onlyReturnChangedAttributes: boolean;
}

const MatterLightTypes = new Set([
  MatterDeviceType.OnOffLight,
  MatterDeviceType.ExtendedColorLight,
  MatterDeviceType.OnOffLightSwitch,
  MatterDeviceType.ColorTemperatureLight,
  MatterDeviceType.DimmableLight
]);

export class MatterDevice {
  endpointDeviceTypeId: DeviceTypeId;
  endpointNumber: number;
  endpointProductName: string | undefined;
  endpointLabel: string | undefined;
  endpointSerialNumber: string | undefined;
  entityIdentifier: string | undefined;
  entity: uc.Entity | undefined;
  entityId: string | undefined;
  entityLabel: string | undefined;
  onOffClient: ClusterClientObj<OnOff.Complete> | undefined;
  levelControlClient: ClusterClientObj<LevelControl.Complete> | undefined;
  colorControlClient: ClusterClientObj<ColorControl.Complete> | undefined;
  bridgedDeviceBasicInformationClient: ClusterClientObj<BridgedDeviceBasicInformation.Complete>;
  attributeListenersAdded: boolean = false;
  entityAttributes: { [key: string]: string | number | boolean | string[] } = {};
  onOffListener: ((value: boolean) => void) | undefined;
  levelListener: ((value: number | null) => void) | undefined;
  hueListener: ((value: number) => void) | undefined;
  saturationListener: ((value: number) => void) | undefined;
  colorTemperatureListener: ((value: number) => void) | undefined;

  constructor(endpoint: Endpoint) {
    this.endpointDeviceTypeId = endpoint.deviceType;
    this.endpointNumber = endpoint.number!;
    this.onOffClient = endpoint.getClusterClient(OnOff.Complete);
    this.levelControlClient = endpoint.getClusterClient(LevelControl.Complete);
    this.colorControlClient = endpoint.getClusterClient(ColorControl.Complete);
    this.bridgedDeviceBasicInformationClient =
      endpoint.getClusterClient(BridgedDeviceBasicInformation.Complete) ??
      (() => {
        throw new Error("No BridgedDeviceBasicInformation.");
      })();
  }

  async init(matterBridge: MatterBridge) {
    this.endpointProductName = await this.bridgedDeviceBasicInformationClient.getProductNameAttribute();
    this.endpointLabel = await this.bridgedDeviceBasicInformationClient.getNodeLabelAttribute();
    this.endpointSerialNumber = await this.bridgedDeviceBasicInformationClient.getSerialNumberAttribute();

    if (matterBridge.vendorName == "openHAB" && this.endpointProductName) {
      this.entityIdentifier = this.endpointProductName.replace(" ", "_");
    } else if (matterBridge.productName == "MatterHub" && this.endpointSerialNumber) {
      this.entityIdentifier = this.endpointSerialNumber.toString();
    } else {
      this.entityIdentifier = this.endpointNumber.toString();
    }

    this.entityId = `${matterBridge.entityIdentifier}|${this.entityIdentifier}`;

    if (this.endpointLabel) {
      this.entityLabel = `${matterBridge.label}: ${this.endpointLabel}`;
    } else {
      this.entityLabel = `${matterBridge.label}: ${this.endpointNumber}`;
    }
  }

  percentToMired(value: number) {
    // Begrenzen auf 0–100
    value = Math.min(100, Math.max(0, value));

    const minKelvin = 2000; // warm
    const maxKelvin = 6500; // kalt

    // Linear von 0–100 auf Kelvin umrechnen
    const kelvin = maxKelvin - (value / 100) * (maxKelvin - minKelvin);

    // Kelvin -> Mired
    return Math.round(1000000 / kelvin);
  }

  miredToPercent(mired: number | undefined): number | uc.LightStates {
    if (mired == undefined) return uc.LightStates.Unknown;

    const minKelvin = 2000; // warm
    const maxKelvin = 6500; // kalt

    // zurück zu Kelvin
    const kelvin = 1_000_000 / mired;

    // zurück zu Prozent
    let percent = ((maxKelvin - kelvin) / (maxKelvin - minKelvin)) * 100;

    // Begrenzen auf 0–100
    percent = Math.min(100, Math.max(0, percent));

    return Math.round(percent);
  }

  matterHueToUc(value: number | undefined) {
    return value == undefined ? uc.LightStates.Unknown : Math.round((value / 254) * 360);
  }

  ucHueToMatter(value: number) {
    return Math.round((value / 360) * 254);
  }

  matterSaturationToUc(value: number | undefined) {
    return value == undefined ? uc.LightStates.Unknown : value + 1;
  }

  ucSaturationToMatter(value: number) {
    return value - 1;
  }

  matterLevelToUc(value: number | null | undefined) {
    return value == null || value == undefined ? uc.LightStates.Unknown : value + 1;
  }

  matterLevelToUcSwitchState(value: number | null | undefined) {
    return value == null || value == undefined
      ? uc.LightStates.Unknown
      : value > 0
        ? uc.SwitchStates.On
        : uc.SwitchStates.Off;
  }

  ucLevelToMatter(value: number) {
    return value - 1;
  }

  matterOnOffToUcSwitchState(value: boolean | undefined) {
    return value === true ? uc.SwitchStates.On : value === false ? uc.SwitchStates.Off : uc.SwitchStates.Unknown;
  }

  matterOnOffToUcLightState(value: boolean | undefined) {
    return value === true ? uc.LightStates.On : value === false ? uc.LightStates.Off : uc.LightStates.Unknown;
  }

  addAttributeListeners() {
    if (!this.entityId) {
      throw new Error("MatterDevice not initialized");
    }

    if (this.attributeListenersAdded) return;

    log.debug(`addAttributeListeners for entity id: ${this.entityId}`);

    if (this.entity?.entity_type == uc.EntityType.Light) {
      if (this.colorControlClient) {
        this.hueListener = (value: number) => {
          this.updateEntityAttributes({
            [uc.LightAttributes.Hue]: this.matterHueToUc(value)
          });
          log.debug(`Hue update value ${value} on entity ${this.entityId}.`);
        };

        this.colorControlClient.addCurrentHueAttributeListener(this.hueListener);

        this.saturationListener = (value: number) => {
          this.updateEntityAttributes({
            [uc.LightAttributes.Saturation]: this.matterSaturationToUc(value)
          });
          log.debug(`Saturation update value ${value} on entity ${this.entityId}.`);
        };

        this.colorControlClient.addCurrentSaturationAttributeListener(this.saturationListener);

        this.colorTemperatureListener = (value: number) => {
          this.updateEntityAttributes({
            [uc.LightAttributes.ColorTemperature]: this.miredToPercent(value)
          });
          log.debug(`Color update value ${value} on entity ${this.entityId}.`);
        };

        this.colorControlClient.addColorTemperatureMiredsAttributeListener(this.colorTemperatureListener);
      }

      if (this.levelControlClient) {
        this.levelListener = (value: number | null) => {
          let entityAttributes: { [key: string]: string | number | boolean } = {
            [uc.LightAttributes.Brightness]: this.matterLevelToUc(value)
          };

          if (this.onOffClient) {
            entityAttributes[uc.LightAttributes.State] = this.matterLevelToUcSwitchState(value);
          }

          this.updateEntityAttributes(entityAttributes);
          log.debug(`Level update value ${value} on entity ${this.entityId}.`);
        };

        this.levelControlClient.addCurrentLevelAttributeListener(this.levelListener);
      }

      if (this.onOffClient) {
        this.onOffListener = (value: boolean) => {
          let entityAttributes: { [key: string]: string | number | boolean } = {
            [uc.LightAttributes.State]: this.matterOnOffToUcLightState(value)
          };

          if (this.levelControlClient) {
            if (value) {
              entityAttributes[uc.LightAttributes.Brightness] = this.matterLevelToUc(
                this.levelControlClient.getCurrentLevelAttributeFromCache()
              );
            } else {
              entityAttributes[uc.LightAttributes.Brightness] = 0;
            }
          }

          this.updateEntityAttributes(entityAttributes);
          log.debug(`OnOff update value ${value} on entity ${this.entityId}.`);
        };

        this.onOffClient.addOnOffAttributeListener(this.onOffListener);
      }
    } else if (this.entity?.entity_type == uc.EntityType.Switch) {
      if (this.onOffClient) {
        this.onOffListener = (value: boolean) => {
          this.updateEntityAttributes({
            [uc.SwitchAttributes.State]: this.matterOnOffToUcSwitchState(value)
          });

          log.debug(`OnOff update value ${value} on entity ${this.entityId}.`);
        };

        this.onOffClient.addOnOffAttributeListener(this.onOffListener);
      }
    }

    this.attributeListenersAdded = true;
  }

  private async getLightEntityAttributes(options: GetEntityAttributeOptions) {
    let entityAttributes: { [key: string]: string | number | boolean } = {};

    if (this.colorControlClient) {
      let entityHue = options.initFromMatterCache
        ? this.matterHueToUc(this.colorControlClient.getCurrentHueAttributeFromCache())
        : this.entityAttributes[uc.LightAttributes.Hue];

      if (options.requestFromRemote) {
        let remoteHue = this.matterHueToUc(
          await this.colorControlClient.getCurrentHueAttribute(options.requestFromRemote)
        );

        if (entityHue != remoteHue || !options.onlyReturnChangedAttributes) {
          entityAttributes[uc.LightAttributes.Hue] = remoteHue;
          log.debug(`Hue changed from ${entityHue} to ${remoteHue} on entity ${this.entityId}.`);
        }
      } else if (entityHue != undefined && typeof entityHue === "number") {
        entityAttributes[uc.LightAttributes.Hue] = this.matterHueToUc(entityHue);
        log.debug(`Send cached hue value ${entityHue} on entity ${this.entityId}.`);
      }

      let entitySaturation = options.initFromMatterCache
        ? this.matterSaturationToUc(this.colorControlClient.getCurrentSaturationAttributeFromCache())
        : this.entityAttributes[uc.LightAttributes.Saturation];

      if (options.requestFromRemote) {
        let remoteSaturation = this.matterSaturationToUc(
          await this.colorControlClient.getCurrentSaturationAttribute(options.requestFromRemote)
        );

        if (entitySaturation != remoteSaturation || !options.onlyReturnChangedAttributes) {
          entityAttributes[uc.LightAttributes.Saturation] = remoteSaturation;
          log.debug(`Saturation changed from ${entitySaturation} to ${remoteSaturation} on entity ${this.entityId}.`);
        }
      } else if (entitySaturation != undefined && typeof entitySaturation === "number") {
        entityAttributes[uc.LightAttributes.Saturation] = this.matterSaturationToUc(entitySaturation);
        log.debug(`Send cached saturation value ${entitySaturation} on entity ${this.entityId}.`);
      }

      let entityColorTemperature = options.initFromMatterCache
        ? this.miredToPercent(this.colorControlClient.getColorTemperatureMiredsAttributeFromCache())
        : this.entityAttributes[uc.LightAttributes.ColorTemperature];

      if (options.requestFromRemote) {
        let remoteColorTemperature = this.miredToPercent(
          await this.colorControlClient.getColorTemperatureMiredsAttribute(options.requestFromRemote)
        );

        if (entityColorTemperature != remoteColorTemperature || !options.onlyReturnChangedAttributes) {
          entityAttributes[uc.LightAttributes.ColorTemperature] = remoteColorTemperature;
          log.debug(
            `Color temperature changed from ${entityColorTemperature} to ${remoteColorTemperature} on entity ${this.entityId}.`
          );
        }
      } else if (entityColorTemperature != undefined && typeof entityColorTemperature === "number") {
        entityAttributes[uc.LightAttributes.ColorTemperature] = this.miredToPercent(entityColorTemperature);
        log.debug(`Send cached color temperature value ${entityColorTemperature} on entity ${this.entityId}.`);
      }
    }

    if (this.levelControlClient) {
      let entityLevel = options.initFromMatterCache
        ? this.matterLevelToUc(this.levelControlClient.getCurrentLevelAttributeFromCache())
        : this.entityAttributes[uc.LightAttributes.Brightness];

      if (options.requestFromRemote) {
        let remoteLevel = this.matterLevelToUc(
          await this.levelControlClient.getCurrentLevelAttribute(options.requestFromRemote)
        );

        if (entityLevel != remoteLevel || !options.onlyReturnChangedAttributes) {
          entityAttributes[uc.LightAttributes.Brightness] = remoteLevel;
          log.debug(`Level changed from ${entityLevel} to ${remoteLevel} on entity ${this.entityId}.`);
        }
      } else if (entityLevel != undefined && typeof entityLevel === "number") {
        entityAttributes[uc.LightAttributes.Brightness] = this.matterLevelToUc(entityLevel);
        log.debug(`Send cached level value ${entityLevel} on entity ${this.entityId}.`);
      }
    }

    if (this.onOffClient) {
      let entityState = options.initFromMatterCache
        ? this.matterOnOffToUcLightState(this.onOffClient.getOnOffAttributeFromCache())
        : this.entityAttributes[uc.LightAttributes.State];

      if (options.requestFromRemote) {
        let remoteState = this.matterOnOffToUcLightState(
          await this.onOffClient.getOnOffAttribute(options.requestFromRemote)
        );

        if (entityState != remoteState || !options.onlyReturnChangedAttributes) {
          entityAttributes[uc.LightAttributes.State] = remoteState;
          log.debug(`State changed from ${entityState} to ${remoteState} on entity ${this.entityId}.`);
        }
      } else if (entityState != undefined && typeof entityState === "boolean") {
        entityAttributes[uc.LightAttributes.State] = this.matterOnOffToUcLightState(entityState);
        log.debug(`Send cached state value ${entityState} on entity ${this.entityId}.`);
      }

      if (this.levelControlClient && entityAttributes[uc.LightAttributes.State] == uc.LightStates.Off) {
        entityAttributes[uc.LightAttributes.Brightness] = 0;
      }
    }

    return entityAttributes;
  }

  private async getSwitchEntityAttributes(options: GetEntityAttributeOptions) {
    let entityAttributes: { [key: string]: string | number | boolean } = {};

    if (this.onOffClient) {
      let entityState = options.initFromMatterCache
        ? this.matterOnOffToUcLightState(this.onOffClient.getOnOffAttributeFromCache())
        : this.entityAttributes[uc.SwitchAttributes.State];

      if (options.requestFromRemote) {
        let remoteState = this.matterOnOffToUcLightState(
          await this.onOffClient.getOnOffAttribute(options.requestFromRemote)
        );

        if (entityState != remoteState || !options.onlyReturnChangedAttributes) {
          entityAttributes[uc.SwitchAttributes.State] = remoteState;
          log.debug(`State changed from ${entityState} to ${remoteState} on entity ${this.entityId}.`);
        }
      } else if (entityState != undefined && typeof entityState === "boolean") {
        entityAttributes[uc.SwitchAttributes.State] = this.matterOnOffToUcSwitchState(entityState);
        log.debug(`Send cached state value ${entityState} on entity ${this.entityId}.`);
      }
    }

    return entityAttributes;
  }

  async sendAttributes(options: GetEntityAttributeOptions) {
    if (!this.entityId) {
      throw new Error("MatterDevice not initialized");
    }

    if (!this.attributeListenersAdded || !this.entity) return;

    let entityAttributes: { [key: string]: string | number | boolean } = {};

    switch (this.entity.entity_type) {
      case uc.EntityType.Light:
        entityAttributes = await this.getLightEntityAttributes(options);
        break;
      case uc.EntityType.Switch:
        entityAttributes = await this.getSwitchEntityAttributes(options);
        break;
      default:
        return;
    }

    if (Object.keys(entityAttributes).length) {
      this.updateEntityAttributes(entityAttributes);
    }
  }

  updateEntityAttributes(attributes: { [key: string]: string | number | boolean }) {
    if (!this.entityId) {
      throw new Error("MatterDevice not initialized");
    }

    if (driver.updateEntityAttributes(this.entityId, attributes)) {
      this.updateCachedEntityAttributes(attributes);
    }
  }

  updateCachedEntityAttributes(attributes: { [key: string]: string | number | boolean | string[] }) {
    for (const [key, value] of Object.entries(attributes)) {
      this.entityAttributes[key] = value;
    }
  }

  removeAttributeListeners() {
    if (!this.attributeListenersAdded) return;

    log.debug(`removeAttributeListeners for entity id: ${this.entityId}`);

    if (this.onOffClient && this.onOffListener) {
      this.onOffClient.removeOnOffAttributeListener(this.onOffListener);
    }

    if (this.levelControlClient && this.levelListener) {
      this.levelControlClient.removeCurrentLevelAttributeListener(this.levelListener);
    }

    if (this.colorControlClient && this.hueListener) {
      this.colorControlClient.removeCurrentHueAttributeListener(this.hueListener);
    }

    if (this.colorControlClient && this.saturationListener) {
      this.colorControlClient.removeCurrentSaturationAttributeListener(this.saturationListener);
    }

    if (this.colorControlClient && this.colorTemperatureListener) {
      this.colorControlClient.removeColorTemperatureMiredsAttributeListener(this.colorTemperatureListener);
    }

    this.attributeListenersAdded = false;
  }

  async getUcEntity() {
    let entityTypeId = this.endpointDeviceTypeId.valueOf();

    if (MatterLightTypes.has(entityTypeId)) {
      this.entity = await this.getUcLightEntity();
    } else if (MatterSwitchTypes.has(entityTypeId)) {
      this.entity = await this.getUcSwitchEntity();
    } else {
      log.warn(`Matter device type id ${entityTypeId} not supported at the moment.`);
    }

    return this.entity;
  }

  private async getUcLightEntity() {
    let entity: uc.Entity | undefined = undefined;

    var lightFeatures: uc.LightFeatures[] = [];

    let entityAttributes = await this.getLightEntityAttributes({
      initFromMatterCache: true,
      requestFromRemote: false,
      onlyReturnChangedAttributes: false
    });

    if (this.colorControlClient) {
      lightFeatures.push(uc.LightFeatures.Color, uc.LightFeatures.ColorTemperature);
    }

    if (this.levelControlClient) {
      lightFeatures.push(uc.LightFeatures.Dim);
    }

    if (this.onOffClient) {
      lightFeatures.push(uc.LightFeatures.OnOff, uc.LightFeatures.Toggle);
    }

    entity = new uc.Light(this.entityId!, this.entityLabel!, {
      features: lightFeatures,
      attributes: entityAttributes
    });

    entity.setCmdHandler(lightCmdHandler);

    return entity;
  }

  private async getUcSwitchEntity() {
    let entity: uc.Entity | undefined = undefined;

    if (this.onOffClient) {
      var deviceClass =
        this.endpointDeviceTypeId.valueOf() == MatterDeviceType.OnOffPlugInUnit
          ? uc.SwitchDeviceClasses.Outlet
          : uc.SwitchDeviceClasses.Switch;

      let entityAttributes = await this.getSwitchEntityAttributes({
        initFromMatterCache: true,
        requestFromRemote: false,
        onlyReturnChangedAttributes: false
      });

      entity = new uc.Switch(this.entityId!, this.entityLabel!, {
        features: [uc.SwitchFeatures.OnOff, uc.SwitchFeatures.Toggle],
        attributes: entityAttributes,
        deviceClass: deviceClass
      });
      entity.setCmdHandler(switchCmdHandler);
    }

    return entity;
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
