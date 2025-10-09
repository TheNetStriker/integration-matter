import * as uc from "@unfoldedcircle/integration-api";
import { ColorControl, LevelControl, OnOff } from "@matter/main/clusters";

import log from "../loggers.js";
import { MatterValueConverters } from "../matter_value_converters.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { driverConfig } from "../config.js";
import { Endpoint } from "@project-chip/matter.js/device";

export class LightDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.attributeListenersAdded) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    const colorControlClient = this.endpoint.getClusterClient(ColorControl.Complete);
    const levelControlClient = this.endpoint.getClusterClient(LevelControl.Complete);
    const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);

    if (colorControlClient) {
      this.addAttributeListener(uc.LightAttributes.Hue);
      this.addAttributeListener(uc.LightAttributes.Saturation);
      this.addAttributeListener(uc.LightAttributes.ColorTemperature);
    }

    if (levelControlClient) {
      this.addAttributeListener(uc.LightAttributes.Brightness);
    }

    if (onOffClient) {
      this.addAttributeListener(uc.LightAttributes.State);
    }

    this.attributeListenersAdded = true;
  }

  static async initUcEnstity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
    var lightFeatures: uc.LightFeatures[] = [];

    if (endpoint.hasClusterClient(ColorControl.Complete)) {
      lightFeatures.push(uc.LightFeatures.Color, uc.LightFeatures.ColorTemperature);
    }

    if (endpoint.hasClusterClient(LevelControl.Complete)) {
      lightFeatures.push(uc.LightFeatures.Dim);
    }

    if (endpoint.hasClusterClient(OnOff.Complete)) {
      lightFeatures.push(uc.LightFeatures.OnOff, uc.LightFeatures.Toggle);
    }

    const entity = new uc.Light(deviceInfo.entityId, deviceInfo.entityLabel, {
      features: lightFeatures
    });

    return entity;
  }

  async getEntityAttributes(options: GetEntityAttributeOptions) {
    let entityAttributes: { [key: string]: string | number | boolean } = {};

    let entityHue = await this.getEntityAttribute(options, uc.LightAttributes.Hue);
    if (entityHue != undefined) entityAttributes[uc.LightAttributes.Hue] = entityHue;

    let entitySaturation = await this.getEntityAttribute(options, uc.LightAttributes.Saturation);
    if (entitySaturation !== undefined) entityAttributes[uc.LightAttributes.Saturation] = entitySaturation;

    let entityColorTemperature = await this.getEntityAttribute(options, uc.LightAttributes.ColorTemperature);
    if (entityColorTemperature !== undefined)
      entityAttributes[uc.LightAttributes.ColorTemperature] = entityColorTemperature;

    let entityLevel = await this.getEntityAttribute(options, uc.LightAttributes.Brightness);
    if (entityLevel !== undefined) entityAttributes[uc.LightAttributes.Brightness] = entityLevel;

    let entityState = await this.getEntityAttribute(options, uc.LightAttributes.State);
    if (entityState !== undefined) entityAttributes[uc.LightAttributes.State] = entityState;

    return entityAttributes;
  }

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
  async entityCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> {
    log.debug("Got %s command request: %s params: %s", entity.id, cmdId, params);

    if (!this.matterBridge.rootNode.isConnected) {
      return uc.StatusCodes.ServiceUnavailable;
    }

    const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);
    const levelControlClient = this.endpoint.getClusterClient(LevelControl.Complete);
    const colorControlClient = this.endpoint.getClusterClient(ColorControl.Complete);

    try {
      switch (cmdId) {
        case uc.LightCommands.Toggle:
          if (!onOffClient) return uc.StatusCodes.NotFound;
          onOffClient.toggle();
          break;
        case uc.LightCommands.On:
          if (onOffClient && params?.brightness == 0) {
            // We have a brightness parameter of 0, turn the light off.
            onOffClient.off();
            break;
          }

          if (params?.brightness && onOffClient?.getOnOffAttributeFromCache() == false) {
            // We have a brightness parameter and the light is currently off. Turn  the light on first.
            await onOffClient.on();
          }

          if (levelControlClient && typeof params?.brightness === "number") {
            await levelControlClient.moveToLevel({
              level: MatterValueConverters.ucLevelToMatter(params.brightness),
              transitionTime: driverConfig.get().lightTransitionTime,
              optionsMask: {},
              optionsOverride: {}
            });
            break;
          }

          if (colorControlClient && typeof params?.color_temperature === "number") {
            await colorControlClient.moveToColorTemperature({
              colorTemperatureMireds: MatterValueConverters.ucPercentToMired(params.color_temperature),
              transitionTime: driverConfig.get().lightTransitionTime,
              optionsMask: {},
              optionsOverride: {}
            });
            break;
          }

          if (colorControlClient && typeof params?.hue === "number" && typeof params?.saturation === "number") {
            await colorControlClient.moveToHueAndSaturation({
              hue: MatterValueConverters.ucHueToMatter(params.hue),
              saturation: MatterValueConverters.ucSaturationToMatter(params.saturation),
              transitionTime: driverConfig.get().lightTransitionTime,
              optionsMask: {},
              optionsOverride: {}
            });
            break;
          } else {
            if (!onOffClient) return uc.StatusCodes.NotFound;
            onOffClient.on();
            break;
          }
        case uc.LightCommands.Off:
          if (!onOffClient) return uc.StatusCodes.NotFound;
          onOffClient.off();
          break;
        default:
          return uc.StatusCodes.NotImplemented;
      }
    } catch (e) {
      log.error(e);
      return uc.StatusCodes.ServiceUnavailable;
    }

    return uc.StatusCodes.Ok;
  }
}
