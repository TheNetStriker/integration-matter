import {
  ColorControl,
  LevelControl,
  OnOff,
  TemperatureMeasurement,
  RelativeHumidityMeasurement
} from "@matter/main/clusters";
import { EntityType, LightAttributes, SensorAttributes, SensorDeviceClasses } from "@unfoldedcircle/integration-api";
import { Endpoint } from "@project-chip/matter.js/device";
import { MatterValueConverters } from "./converters.js";
import { MatterDeviceType } from "../devices/device_maps.js";

export class MatterHelpers {
  static getMatterToUcStateConverter(
    entityType: string,
    entityAttribute: string,
    endpointDeviceType: number
  ): ((value: any) => any) | undefined {
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
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value: {
            switch (endpointDeviceType) {
              case MatterDeviceType.TemperatureSensor:
                return MatterValueConverters.matterTemperatureToUc;
              case MatterDeviceType.HumiditySensor:
                return MatterValueConverters.matterHumidityToUc;
            }
          }
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
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement.Complete)?.getMeasuredValueAttribute;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement.Complete)?.getMeasuredValueAttribute;
            }
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
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement.Complete)?.getMeasuredValueAttributeFromCache;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement.Complete)
                  ?.getMeasuredValueAttributeFromCache;
            }
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
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement.Complete)?.addMeasuredValueAttributeListener;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement.Complete)
                  ?.addMeasuredValueAttributeListener;
            }
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
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement.Complete)?.removeMeasuredValueAttributeListener;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement.Complete)
                  ?.removeMeasuredValueAttributeListener;
            }
        }
    }
  }

  static getUcSensorDeviceClass(matterDeviceType: number) {
    switch (matterDeviceType) {
      case MatterDeviceType.TemperatureSensor:
        return SensorDeviceClasses.Temperature;
      case MatterDeviceType.HumiditySensor:
        return SensorDeviceClasses.Humidity;
      default:
        return SensorDeviceClasses.Custom;
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
