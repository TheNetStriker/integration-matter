import {
  CoverAttributes,
  EntityType,
  LightAttributes,
  SensorAttributes,
  SensorDeviceClasses
} from "@unfoldedcircle/integration-api";
import { Endpoint } from "@matter/node";
import { OnOffClient } from "@matter/node/behaviors/on-off";
import { LevelControlClient } from "@matter/node/behaviors/level-control";
import { ColorControlClient } from "@matter/node/behaviors/color-control";
import { WindowCoveringClient } from "@matter/node/behaviors/window-covering";
import { TemperatureMeasurementClient } from "@matter/node/behaviors/temperature-measurement";
import { RelativeHumidityMeasurementClient } from "@matter/node/behaviors/relative-humidity-measurement";
import { DescriptorClient } from "@matter/node/behaviors/descriptor";
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

  /**
   * Returns a function that performs a remote (network) read of the given attribute.
   */
  static getMatterAttribute(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((...args: any[]) => any) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return endpoint.behaviors.has(OnOffClient)
          ? () => endpoint.getStateOf(OnOffClient).then((s) => s.onOff)
          : undefined;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.behaviors.has(OnOffClient)
              ? () => endpoint.getStateOf(OnOffClient).then((s) => s.onOff)
              : undefined;
          case LightAttributes.Brightness:
            return endpoint.behaviors.has(LevelControlClient)
              ? () => endpoint.getStateOf(LevelControlClient).then((s) => s.currentLevel)
              : undefined;
          case LightAttributes.Hue:
            return endpoint.behaviors.has(ColorControlClient)
              ? () => endpoint.getStateOf(ColorControlClient).then((s) => s.currentHue)
              : undefined;
          case LightAttributes.Saturation:
            return endpoint.behaviors.has(ColorControlClient)
              ? () => endpoint.getStateOf(ColorControlClient).then((s) => s.currentSaturation)
              : undefined;
          case LightAttributes.ColorTemperature:
            return endpoint.behaviors.has(ColorControlClient)
              ? () => endpoint.getStateOf(ColorControlClient).then((s) => s.colorTemperatureMireds)
              : undefined;
        }
        break;
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.stateOf(DescriptorClient).deviceTypeList[0]?.deviceType) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.behaviors.has(TemperatureMeasurementClient)
                  ? () => endpoint.getStateOf(TemperatureMeasurementClient).then((s) => s.measuredValue)
                  : undefined;
              case MatterDeviceType.HumiditySensor:
                return endpoint.behaviors.has(RelativeHumidityMeasurementClient)
                  ? () => endpoint.getStateOf(RelativeHumidityMeasurementClient).then((s) => s.measuredValue)
                  : undefined;
            }
        }
        break;
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return endpoint.behaviors.has(WindowCoveringClient)
              ? () => endpoint.getStateOf(WindowCoveringClient).then((s) => s.targetPositionLiftPercent100ths)
              : undefined;
          case CoverAttributes.Position:
            return endpoint.behaviors.has(WindowCoveringClient)
              ? () => endpoint.getStateOf(WindowCoveringClient).then((s) => s.currentPositionLiftPercent100ths)
              : undefined;
          case CoverAttributes.TiltPosition:
            return endpoint.behaviors.has(WindowCoveringClient)
              ? () => endpoint.getStateOf(WindowCoveringClient).then((s) => s.currentPositionTiltPercent100ths)
              : undefined;
        }
        break;
    }
    return undefined;
  }

  /**
   * Returns a function that reads the cached (local) value of the given attribute.
   */
  static getMatterAttributeFromCache(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((...args: any[]) => any) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        return endpoint.behaviors.has(OnOffClient) ? () => endpoint.stateOf(OnOffClient).onOff : undefined;
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            return endpoint.behaviors.has(OnOffClient) ? () => endpoint.stateOf(OnOffClient).onOff : undefined;
          case LightAttributes.Brightness:
            return endpoint.behaviors.has(LevelControlClient)
              ? () => endpoint.stateOf(LevelControlClient).currentLevel
              : undefined;
          case LightAttributes.Hue:
            return endpoint.behaviors.has(ColorControlClient)
              ? () => endpoint.stateOf(ColorControlClient).currentHue
              : undefined;
          case LightAttributes.Saturation:
            return endpoint.behaviors.has(ColorControlClient)
              ? () => endpoint.stateOf(ColorControlClient).currentSaturation
              : undefined;
          case LightAttributes.ColorTemperature:
            return endpoint.behaviors.has(ColorControlClient)
              ? () => endpoint.stateOf(ColorControlClient).colorTemperatureMireds
              : undefined;
        }
        break;
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.stateOf(DescriptorClient).deviceTypeList[0]?.deviceType) {
              case MatterDeviceType.TemperatureSensor:
                return endpoint.behaviors.has(TemperatureMeasurementClient)
                  ? () => endpoint.stateOf(TemperatureMeasurementClient).measuredValue
                  : undefined;
              case MatterDeviceType.HumiditySensor:
                return endpoint.behaviors.has(RelativeHumidityMeasurementClient)
                  ? () => endpoint.stateOf(RelativeHumidityMeasurementClient).measuredValue
                  : undefined;
            }
        }
        break;
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            return endpoint.behaviors.has(WindowCoveringClient)
              ? () => endpoint.stateOf(WindowCoveringClient).targetPositionLiftPercent100ths
              : undefined;
          case CoverAttributes.Position:
            return endpoint.behaviors.has(WindowCoveringClient)
              ? () => endpoint.stateOf(WindowCoveringClient).currentPositionLiftPercent100ths
              : undefined;
          case CoverAttributes.TiltPosition:
            return endpoint.behaviors.has(WindowCoveringClient)
              ? () => endpoint.stateOf(WindowCoveringClient).currentPositionTiltPercent100ths
              : undefined;
        }
        break;
    }
    return undefined;
  }

  /**
   * Returns a function that registers a listener for the given attribute's change event.
   * In the new API, attribute change events are named `<attributeName>$Changed` on the behavior's events.
   */
  static getAddMatterAttributeListener(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((listener: any) => void) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        if (!endpoint.behaviors.has(OnOffClient)) return undefined;
        return (listener) => endpoint.eventsOf(OnOffClient).onOff$Changed.on(listener);
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            if (!endpoint.behaviors.has(OnOffClient)) return undefined;
            return (listener) => endpoint.eventsOf(OnOffClient).onOff$Changed.on(listener);
          case LightAttributes.Brightness:
            if (!endpoint.behaviors.has(LevelControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(LevelControlClient).currentLevel$Changed.on(listener);
          case LightAttributes.Hue:
            if (!endpoint.behaviors.has(ColorControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(ColorControlClient).currentHue$Changed.on(listener);
          case LightAttributes.Saturation:
            if (!endpoint.behaviors.has(ColorControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(ColorControlClient).currentSaturation$Changed.on(listener);
          case LightAttributes.ColorTemperature:
            if (!endpoint.behaviors.has(ColorControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(ColorControlClient).colorTemperatureMireds$Changed.on(listener);
        }
        break;
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.stateOf(DescriptorClient).deviceTypeList[0]?.deviceType) {
              case MatterDeviceType.TemperatureSensor:
                if (!endpoint.behaviors.has(TemperatureMeasurementClient)) return undefined;
                return (listener) => endpoint.eventsOf(TemperatureMeasurementClient).measuredValue$Changed.on(listener);
              case MatterDeviceType.HumiditySensor:
                if (!endpoint.behaviors.has(RelativeHumidityMeasurementClient)) return undefined;
                return (listener) =>
                  endpoint.eventsOf(RelativeHumidityMeasurementClient).measuredValue$Changed.on(listener);
            }
        }
        break;
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            if (!endpoint.behaviors.has(WindowCoveringClient)) return undefined;
            return (listener) =>
              endpoint.eventsOf(WindowCoveringClient).targetPositionLiftPercent100ths$Changed.on(listener);
          case CoverAttributes.Position:
            if (!endpoint.behaviors.has(WindowCoveringClient)) return undefined;
            return (listener) =>
              endpoint.eventsOf(WindowCoveringClient).currentPositionLiftPercent100ths$Changed.on(listener);
          case CoverAttributes.TiltPosition:
            if (!endpoint.behaviors.has(WindowCoveringClient)) return undefined;
            return (listener) =>
              endpoint.eventsOf(WindowCoveringClient).currentPositionTiltPercent100ths$Changed.on(listener);
        }
        break;
    }
    return undefined;
  }

  /**
   * Returns a function that removes a listener for the given attribute's change event.
   */
  static getRemoveMatterAttributeListener(
    entityType: string,
    entityAttribute: string,
    endpoint: Endpoint
  ): ((listener: any) => void) | undefined {
    switch (entityType) {
      case EntityType.Switch:
        if (!endpoint.behaviors.has(OnOffClient)) return undefined;
        return (listener) => endpoint.eventsOf(OnOffClient).onOff$Changed.off(listener);
      case EntityType.Light:
        switch (entityAttribute) {
          case LightAttributes.State:
            if (!endpoint.behaviors.has(OnOffClient)) return undefined;
            return (listener) => endpoint.eventsOf(OnOffClient).onOff$Changed.off(listener);
          case LightAttributes.Brightness:
            if (!endpoint.behaviors.has(LevelControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(LevelControlClient).currentLevel$Changed.off(listener);
          case LightAttributes.Hue:
            if (!endpoint.behaviors.has(ColorControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(ColorControlClient).currentHue$Changed.off(listener);
          case LightAttributes.Saturation:
            if (!endpoint.behaviors.has(ColorControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(ColorControlClient).currentSaturation$Changed.off(listener);
          case LightAttributes.ColorTemperature:
            if (!endpoint.behaviors.has(ColorControlClient)) return undefined;
            return (listener) => endpoint.eventsOf(ColorControlClient).colorTemperatureMireds$Changed.off(listener);
        }
        break;
      case EntityType.Sensor:
        switch (entityAttribute) {
          case SensorAttributes.Value:
            switch (endpoint.stateOf(DescriptorClient).deviceTypeList[0]?.deviceType) {
              case MatterDeviceType.TemperatureSensor:
                if (!endpoint.behaviors.has(TemperatureMeasurementClient)) return undefined;
                return (listener) =>
                  endpoint.eventsOf(TemperatureMeasurementClient).measuredValue$Changed.off(listener);
              case MatterDeviceType.HumiditySensor:
                if (!endpoint.behaviors.has(RelativeHumidityMeasurementClient)) return undefined;
                return (listener) =>
                  endpoint.eventsOf(RelativeHumidityMeasurementClient).measuredValue$Changed.off(listener);
            }
        }
        break;
      case EntityType.Cover:
        switch (entityAttribute) {
          case CoverAttributes.State:
            if (!endpoint.behaviors.has(WindowCoveringClient)) return undefined;
            return (listener) =>
              endpoint.eventsOf(WindowCoveringClient).targetPositionLiftPercent100ths$Changed.off(listener);
          case CoverAttributes.Position:
            if (!endpoint.behaviors.has(WindowCoveringClient)) return undefined;
            return (listener) =>
              endpoint.eventsOf(WindowCoveringClient).currentPositionLiftPercent100ths$Changed.off(listener);
          case CoverAttributes.TiltPosition:
            if (!endpoint.behaviors.has(WindowCoveringClient)) return undefined;
            return (listener) =>
              endpoint.eventsOf(WindowCoveringClient).currentPositionTiltPercent100ths$Changed.off(listener);
        }
        break;
    }
    return undefined;
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
