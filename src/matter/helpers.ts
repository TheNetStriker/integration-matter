import {
  ColorControl,
  LevelControl,
  OnOff,
  TemperatureMeasurement,
  RelativeHumidityMeasurement,
  WindowCovering
} from "@matter/main/clusters";
import {
  CoverAttributes,
  EntityType,
  LightAttributes,
  SensorAttributes,
  SensorDeviceClasses
} from "@unfoldedcircle/integration-api";
import { Endpoint } from "@project-chip/matter.js/device";
import { MatterValueConverters } from "./converters.js";
import { MatterDeviceType } from "../devices/device_maps.js";

export class MatterHelpers {
  static getMatterToUcStateConverter(
    entityType: string,
    entityAttribute: string,
    endpointDeviceType: number
  ): ((endpoint: Endpoint, value: any) => { [key: string]: string | number | boolean }) | undefined {
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
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return MatterValueConverters.matterWindowCoveringToUcCoverState;
          case CoverAttributes.Position:
            return MatterValueConverters.matterWindowCoveringCurrentPositionToUcCoverPosition;
          case CoverAttributes.TiltPosition:
            return MatterValueConverters.matterWindowCoveringCurrentPositionTiltToUcCoverTiltPosition;
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
        return endpoint.getClusterClient(OnOff)?.getOnOffAttribute;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff)?.getOnOffAttribute;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl)?.getCurrentLevelAttribute;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl)?.getCurrentHueAttribute;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl)?.getCurrentSaturationAttribute;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl)?.getColorTemperatureMiredsAttribute;
        }
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement)?.getMeasuredValueAttribute;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement)?.getMeasuredValueAttribute;
            }
        }
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return endpoint.getClusterClient(WindowCovering)?.getTargetPositionLiftPercent100thsAttribute;
          case CoverAttributes.Position:
            return endpoint.getClusterClient(WindowCovering)?.getCurrentPositionLiftPercent100thsAttribute;
          case CoverAttributes.TiltPosition:
            return endpoint.getClusterClient(WindowCovering)?.getCurrentPositionTiltPercent100thsAttribute;
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
        return endpoint.getClusterClient(OnOff)?.getOnOffAttributeFromCache;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff)?.getOnOffAttributeFromCache;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl)?.getCurrentLevelAttributeFromCache;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl)?.getCurrentHueAttributeFromCache;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl)?.getCurrentSaturationAttributeFromCache;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl)?.getColorTemperatureMiredsAttributeFromCache;
        }
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement)?.getMeasuredValueAttributeFromCache;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement)?.getMeasuredValueAttributeFromCache;
            }
        }
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return endpoint.getClusterClient(WindowCovering)?.getTargetPositionLiftPercent100thsAttributeFromCache;
          case CoverAttributes.Position:
            return endpoint.getClusterClient(WindowCovering)?.getCurrentPositionLiftPercent100thsAttributeFromCache;
          case CoverAttributes.TiltPosition:
            return endpoint.getClusterClient(WindowCovering)?.getCurrentPositionTiltPercent100thsAttributeFromCache;
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
        return endpoint.getClusterClient(OnOff)?.addOnOffAttributeListener;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff)?.addOnOffAttributeListener;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl)?.addCurrentLevelAttributeListener;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl)?.addCurrentHueAttributeListener;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl)?.addCurrentSaturationAttributeListener;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl)?.addColorTemperatureMiredsAttributeListener;
        }
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement)?.addMeasuredValueAttributeListener;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement)?.addMeasuredValueAttributeListener;
            }
        }
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return endpoint.getClusterClient(WindowCovering)?.addTargetPositionLiftPercent100thsAttributeListener;
          case CoverAttributes.Position:
            return endpoint.getClusterClient(WindowCovering)?.addCurrentPositionLiftPercent100thsAttributeListener;
          case CoverAttributes.TiltPosition:
            return endpoint.getClusterClient(WindowCovering)?.addCurrentPositionTiltPercent100thsAttributeListener;
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
        return endpoint.getClusterClient(OnOff)?.removeOnOffAttributeListener;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.getClusterClient(OnOff)?.removeOnOffAttributeListener;
          case LightAttributes.Brightness:
            return endpoint.getClusterClient(LevelControl)?.removeCurrentLevelAttributeListener;
          case LightAttributes.Hue:
            return endpoint.getClusterClient(ColorControl)?.removeCurrentHueAttributeListener;
          case LightAttributes.Saturation:
            return endpoint.getClusterClient(ColorControl)?.removeCurrentSaturationAttributeListener;
          case LightAttributes.ColorTemperature:
            return endpoint.getClusterClient(ColorControl)?.removeColorTemperatureMiredsAttributeListener;
        }
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.deviceType.valueOf()) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.getClusterClient(TemperatureMeasurement)?.removeMeasuredValueAttributeListener;
              case MatterDeviceType.HumiditySensor:
                return endpoint.getClusterClient(RelativeHumidityMeasurement)?.removeMeasuredValueAttributeListener;
            }
        }
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return endpoint.getClusterClient(WindowCovering)?.removeTargetPositionLiftPercent100thsAttributeListener;
          case CoverAttributes.Position:
            return endpoint.getClusterClient(WindowCovering)?.removeCurrentPositionLiftPercent100thsAttributeListener;
          case CoverAttributes.TiltPosition:
            return endpoint.getClusterClient(WindowCovering)?.removeCurrentPositionTiltPercent100thsAttributeListener;
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

  static isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
}
