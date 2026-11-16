import {
  CoverAttributes,
  CoverStates,
  LightAttributes,
  LightStates,
  SensorAttributes,
  SwitchStates
} from "@unfoldedcircle/integration-api";
import { driverConfig, TemperatureUnit } from "../config.js";
import { Endpoint } from "@matter/node";
import { WindowCoveringClient } from "@matter/node/behaviors/window-covering";
import { MatterHelpers } from "./helpers.js";
import log from "../loggers.js";

export class MatterValueConverters {
  static ucCoverPositionToMatterWindowCoveringPosition(position: number): number {
    return position * 100;
  }

  static ucPercentToMired(colorTemperaturePercent: number): number {
    return Math.round(370 - colorTemperaturePercent * 2.32);
  }

  static matterMiredToPercent(
    _endpoint: Endpoint,
    mired: number | undefined
  ): { [key: string]: string | number | boolean } {
    if (mired == undefined)
      return {
        [LightAttributes.ColorTemperature]: LightStates.Unknown
      };

    return { [LightAttributes.ColorTemperature]: Math.round((370 - mired) / 2.32) };
  }

  static ucHueToMatter(hue: number): number {
    return Math.round((hue / 360) * 254);
  }

  static ucSaturationToMatter(saturation: number): number {
    return saturation - 1;
  }

  static matterHueToUc(_endpoint: Endpoint, value: number | undefined): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.Hue]: value == undefined ? LightStates.Unknown : Math.round((value / 254) * 360)
    };
  }

  static ucLevelToMatter(level: number): number {
    return level - 1;
  }

  static matterSaturationToUc(
    _endpoint: Endpoint,
    value: number | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.Saturation]: value == undefined ? LightStates.Unknown : value + 1
    };
  }

  static matterLevelToUc(
    _endpoint: Endpoint,
    value: number | null | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.Brightness]: value == null || value == undefined ? 0 : value + 1
    };
  }

  static matterLevelToUcSwitchState(
    _endpoint: Endpoint,
    value: number | null | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.State]: value == null || value == 0 ? SwitchStates.Off : SwitchStates.On
    };
  }

  static matterOnOffToUcSwitchState(
    _endpoint: Endpoint,
    value: boolean | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.State]: value ? SwitchStates.On : SwitchStates.Off
    };
  }

  static matterOnOffToUcLightState(
    _endpoint: Endpoint,
    value: boolean | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.State]: value ? LightStates.On : LightStates.Off
    };
  }

  static matterTemperatureToUc(_endpoint: Endpoint, value: any): { [key: string]: string | number | boolean } {
    if (driverConfig.get().temperatureUnit == TemperatureUnit.Fahrenheit) {
      return { [SensorAttributes.Value]: value * 0.018 + 32 };
    } else {
      return { [SensorAttributes.Value]: value * 0.01 };
    }
  }

  static matterHumidityToUc(_endpoint: Endpoint, value: any): { [key: string]: string | number | boolean } {
    return { [SensorAttributes.Value]: value * 0.01 };
  }

  static matterWindowCoveringCurrentPositionToUcCoverPosition(
    endpoint: Endpoint,
    currentPosition: number | undefined
  ): { [key: string]: string | number | boolean } {
    const attributes: { [key: string]: string | number | boolean } = {};

    const coverPercentInverted = driverConfig.get().coverPercentInverted;

    if (MatterHelpers.isNumber(currentPosition)) {
      if (coverPercentInverted) {
        currentPosition = 10000 - currentPosition;
      }

      attributes[CoverAttributes.Position] = currentPosition * 0.01;
    }

    if (endpoint.behaviors.has(WindowCoveringClient)) {
      let targetPosition = endpoint.stateOf(WindowCoveringClient).targetPositionLiftPercent100ths;

      if (MatterHelpers.isNumber(targetPosition) && coverPercentInverted) {
        targetPosition = 10000 - targetPosition;
      }

      if (MatterHelpers.isNumber(targetPosition)) {
        attributes[CoverAttributes.Position] = targetPosition * 0.01;
      }
    }

    if (!attributes[CoverAttributes.Position]) {
      log.debug("Cover position unknown, setting to 0");
      attributes[CoverAttributes.Position] = 0;
    }

    return attributes;
  }

  static matterWindowCoveringToUcCoverState(
    endpoint: Endpoint,
    targetPosition: number | undefined
  ): { [key: string]: string | number | boolean } {
    let coverState = CoverStates.Unknown;
    const coverPercentInverted = driverConfig.get().coverPercentInverted;

    if (MatterHelpers.isNumber(targetPosition) && coverPercentInverted) {
      targetPosition = 10000 - targetPosition;
    }

    if (endpoint.behaviors.has(WindowCoveringClient)) {
      let currentPosition = endpoint.stateOf(WindowCoveringClient).currentPositionLiftPercent100ths;

      if (MatterHelpers.isNumber(currentPosition) && coverPercentInverted) {
        currentPosition = 10000 - currentPosition;
      }

      if (MatterHelpers.isNumber(targetPosition) && MatterHelpers.isNumber(currentPosition)) {
        if (targetPosition < currentPosition) {
          coverState = CoverStates.Closing;
        } else if (targetPosition > currentPosition) {
          coverState = CoverStates.Opening;
        } else {
          coverState = targetPosition == 0 ? CoverStates.Closed : CoverStates.Open;
        }
      }
    }

    return { [CoverAttributes.State]: coverState };
  }

  static matterWindowCoveringCurrentPositionTiltToUcCoverTiltPosition(
    _endpoint: Endpoint,
    currentTiltPosition: number | undefined
  ): { [key: string]: string | number | boolean } {
    if (MatterHelpers.isNumber(currentTiltPosition)) {
      return { [CoverAttributes.TiltPosition]: currentTiltPosition * 0.01 };
    }

    return { [CoverAttributes.TiltPosition]: 0 };
  }
}
