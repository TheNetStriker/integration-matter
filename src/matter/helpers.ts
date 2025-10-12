import { ColorControl, LevelControl, OnOff } from "@matter/main/clusters";
import { EntityType, LightAttributes } from "@unfoldedcircle/integration-api";
import { Endpoint } from "@project-chip/matter.js/device";
import { MatterValueConverters } from "./converters.js";

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

  static getMatterAttribute(
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

  static getMatterAttributeFromCache(
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

  static getAddMatterAttributeListener(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((listener: any) => void) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return endpoint.getClusterClient(OnOff.Complete)?.addOnOffAttributeListener;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff.Complete)?.addOnOffAttributeListener;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl.Complete)?.addCurrentLevelAttributeListener;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl.Complete)?.addCurrentHueAttributeListener;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl.Complete)?.addCurrentSaturationAttributeListener;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl.Complete)?.addColorTemperatureMiredsAttributeListener;
        }
    }
  }

  static getRemoveMatterAttributeListener(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((listener: any) => void) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return endpoint.getClusterClient(OnOff.Complete)?.removeOnOffAttributeListener;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff.Complete)?.removeOnOffAttributeListener;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl.Complete)?.removeCurrentLevelAttributeListener;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl.Complete)?.removeCurrentHueAttributeListener;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl.Complete)?.removeCurrentSaturationAttributeListener;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl.Complete)?.removeColorTemperatureMiredsAttributeListener;
        }
    }
  }

  static getReadableEntityAttributeName(attribute: string, capitalizeFirstLetter: boolean) {
    let readableEntityAttributeName = attribute.replace("_", " ");

    if (capitalizeFirstLetter) {
      readableEntityAttributeName = readableEntityAttributeName[0].toUpperCase() + readableEntityAttributeName.slice(1);
    }

    return readableEntityAttributeName;
  }
}
