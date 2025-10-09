import { ColorControl, LevelControl, OnOff } from "@matter/main/clusters";
import { EntityType, LightAttributes } from "@unfoldedcircle/integration-api";
import { Endpoint } from "@project-chip/matter.js/device";
import { MatterValueConverters } from "./matter_value_converters.js";

export class MatterHelpers {
  static getMatterToUcStateConverter(entityType: string, entityAttribute: string): ((value: any) => any) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return MatterValueConverters.matterOnOffToUcSwitchState;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return MatterValueConverters.matterOnOffToUcLightState;
          case LightAttributes.Brightness:
            return MatterValueConverters.matterLevelToUc;
          case LightAttributes.Hue:
            return MatterValueConverters.matterHueToUc;
          case LightAttributes.Saturation:
            return MatterValueConverters.matterSaturationToUc;
          case LightAttributes.ColorTemperature:
            return MatterValueConverters.matterMiredToPercent;
        }
    }
  }

  static getUcStateToMatterConverter(entityType: string, entityAttribute: string): ((value: any) => any) | undefined {
    switch (entityType) {
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.Brightness:
            return MatterValueConverters.ucLevelToMatter;
          case LightAttributes.Hue:
            return MatterValueConverters.ucHueToMatter;
          case LightAttributes.Saturation:
            return MatterValueConverters.ucSaturationToMatter;
          case LightAttributes.ColorTemperature:
            return MatterValueConverters.ucPercentToMired;
        }
    }
  }

  static getAttribute(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((...args: any[]) => any) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return endpoint.getClusterClient(OnOff.Complete)?.getOnOffAttribute;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff.Complete)?.getOnOffAttribute;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl.Complete)?.getCurrentLevelAttribute;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl.Complete)?.getCurrentHueAttribute;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl.Complete)?.getCurrentSaturationAttribute;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl.Complete)?.getColorTemperatureMiredsAttribute;
        }
    }
  }

  static getAttributeFromCache(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((...args: any[]) => any) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return endpoint.getClusterClient(OnOff.Complete)?.getOnOffAttributeFromCache;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff.Complete)?.getOnOffAttributeFromCache;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl.Complete)?.getCurrentLevelAttributeFromCache;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl.Complete)?.getCurrentHueAttributeFromCache;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl.Complete)?.getCurrentSaturationAttributeFromCache;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl.Complete)?.getColorTemperatureMiredsAttributeFromCache;
        }
    }
  }
}
