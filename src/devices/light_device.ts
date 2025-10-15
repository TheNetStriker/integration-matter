import * as uc from "@unfoldedcircle/integration-api";
import { ColorControl, LevelControl, OnOff } from "@matter/main/clusters";
import { Endpoint } from "@project-chip/matter.js/device";

import log from "../loggers.js";
import { MatterValueConverters } from "../matter/converters.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { driverConfig } from "../config.js";

export class LightDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.hasAttributeListeners()) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    if (this.hasAttribute(uc.LightAttributes.Hue)) {
      this.addAttributeListener(uc.LightAttributes.Hue);
    }

    if (this.hasAttribute(uc.LightAttributes.Saturation)) {
      this.addAttributeListener(uc.LightAttributes.Saturation);
    }

    if (this.hasAttribute(uc.LightAttributes.ColorTemperature)) {
      this.addAttributeListener(uc.LightAttributes.ColorTemperature);
    }

    if (this.hasAttribute(uc.LightAttributes.Brightness)) {
      this.addAttributeListener(uc.LightAttributes.Brightness);
    }

    if (this.hasAttribute(uc.LightAttributes.State)) {
      this.addAttributeListener(uc.LightAttributes.State);
    }
  }

  static async initUcEntity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
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
    let entityAttributes = await this.getEntityStateAttributes(
      [
        uc.LightAttributes.Hue,
        uc.LightAttributes.Saturation,
        uc.LightAttributes.ColorTemperature,
        uc.LightAttributes.Brightness,
        uc.LightAttributes.State
      ],
      options
    );

    if (
      this.hasAttribute(uc.LightAttributes.Brightness) &&
      this.hasAttribute(uc.LightAttributes.State) &&
      entityAttributes[uc.LightAttributes.State] == uc.LightStates.Off
    ) {
      entityAttributes[uc.LightAttributes.Brightness] = 0;
    }

    return entityAttributes;
  }

  hasAttribute(attribute: string) {
    if (!this.entity.features) return false;

    switch (attribute) {
      case uc.LightAttributes.Brightness:
        return this.entity.features.includes(uc.LightFeatures.Dim);
      case uc.LightAttributes.ColorTemperature:
        return this.entity.features.includes(uc.LightFeatures.ColorTemperature);
      case uc.LightAttributes.Hue:
        return this.entity.features.includes(uc.LightFeatures.Color);
      case uc.LightAttributes.Saturation:
        return this.entity.features.includes(uc.LightFeatures.Color);
      case uc.LightAttributes.State:
        return this.entity.features.includes(uc.SwitchFeatures.OnOff);
    }

    return false;
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
  entityCmdHandler = async (
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> => {
    log.debug("Got %s command request: %s params: %s", entity.id, cmdId, params);

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
  };
}
