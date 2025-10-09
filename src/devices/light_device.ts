import * as uc from "@unfoldedcircle/integration-api";
import { ColorControl, LevelControl, OnOff } from "@matter/main/clusters";

import log from "../loggers.js";
import { MatterValueConverters } from "../matter_value_converters.js";
import { BaseDevice, GetEntityAttributeOptions } from "./base_device.js";
import { driverConfig } from "../config.js";

export class LightDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.attributeListenersAdded) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    const colorControlClient = this.endpoint.getClusterClient(ColorControl.Complete);
    const levelControlClient = this.endpoint.getClusterClient(LevelControl.Complete);
    const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);

    if (colorControlClient) {
      let hueListener = (value: number) => {
        this.updateEntityAttributes({
          [uc.LightAttributes.Hue]: MatterValueConverters.matterHueToUc(value)
        });
        log.debug(`Hue update value ${value} on entity ${this.deviceInfo.entityId}.`);
      };

      colorControlClient.addCurrentHueAttributeListener(hueListener);
      this.attributeListeners.push({
        listener: hueListener,
        removeMethod: colorControlClient.removeCurrentHueAttributeListener
      });

      let saturationListener = (value: number) => {
        this.updateEntityAttributes({
          [uc.LightAttributes.Saturation]: MatterValueConverters.matterSaturationToUc(value)
        });
        log.debug(`Saturation update value ${value} on entity ${this.deviceInfo.entityId}.`);
      };

      colorControlClient.addCurrentSaturationAttributeListener(saturationListener);
      this.attributeListeners.push({
        listener: saturationListener,
        removeMethod: colorControlClient.removeCurrentSaturationAttributeListener
      });

      let colorTemperatureListener = (value: number) => {
        this.updateEntityAttributes({
          [uc.LightAttributes.ColorTemperature]: MatterValueConverters.matterMiredToPercent(value)
        });
        log.debug(`Color update value ${value} on entity ${this.deviceInfo.entityId}.`);
      };

      colorControlClient.addColorTemperatureMiredsAttributeListener(colorTemperatureListener);
      this.attributeListeners.push({
        listener: colorTemperatureListener,
        removeMethod: colorControlClient.removeColorTemperatureMiredsAttributeListener
      });
    }

    if (levelControlClient) {
      let levelListener = (value: number | null) => {
        let entityAttributes: { [key: string]: string | number | boolean } = {
          [uc.LightAttributes.Brightness]: MatterValueConverters.matterLevelToUc(value)
        };

        if (onOffClient) {
          entityAttributes[uc.LightAttributes.State] = MatterValueConverters.matterLevelToUcSwitchState(value);
        }

        this.updateEntityAttributes(entityAttributes);
        log.debug(`Level update value ${value} on entity ${this.deviceInfo.entityId}.`);
      };

      levelControlClient.addCurrentLevelAttributeListener(levelListener);
      this.attributeListeners.push({
        listener: levelListener,
        removeMethod: levelControlClient.removeCurrentLevelAttributeListener
      });
    }

    if (onOffClient) {
      let onOffListener = (value: boolean) => {
        let entityAttributes: { [key: string]: string | number | boolean } = {
          [uc.LightAttributes.State]: MatterValueConverters.matterOnOffToUcLightState(value)
        };

        if (levelControlClient) {
          if (value) {
            entityAttributes[uc.LightAttributes.Brightness] = MatterValueConverters.matterLevelToUc(
              levelControlClient.getCurrentLevelAttributeFromCache()
            );
          } else {
            entityAttributes[uc.LightAttributes.Brightness] = 0;
          }
        }

        this.updateEntityAttributes(entityAttributes);
        log.debug(`OnOff update value ${value} on entity ${this.deviceInfo.entityId}.`);
      };

      onOffClient.addOnOffAttributeListener(onOffListener);
      this.attributeListeners.push({
        listener: onOffListener,
        removeMethod: onOffClient.removeOnOffAttributeListener
      });
    }

    this.attributeListenersAdded = true;
  }

  async initUcEntity(): Promise<void> {
    var lightFeatures: uc.LightFeatures[] = [];

    if (this.endpoint.hasClusterClient(ColorControl.Complete)) {
      lightFeatures.push(uc.LightFeatures.Color, uc.LightFeatures.ColorTemperature);
    }

    if (this.endpoint.hasClusterClient(LevelControl.Complete)) {
      lightFeatures.push(uc.LightFeatures.Dim);
    }

    if (this.endpoint.hasClusterClient(OnOff.Complete)) {
      lightFeatures.push(uc.LightFeatures.OnOff, uc.LightFeatures.Toggle);
    }

    this.entity = new uc.Light(this.deviceInfo.entityId, this.deviceInfo.entityLabel, {
      features: lightFeatures
    });

    this.entity.attributes = await this.getEntityAttributes({
      initFromMatterCache: true,
      requestFromRemote: false,
      onlyReturnChangedAttributes: false
    });

    this.entity.setCmdHandler(this.lightCmdHandler.bind(this));
  }

  protected async getEntityAttributes(options: GetEntityAttributeOptions) {
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
  async lightCmdHandler(
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
