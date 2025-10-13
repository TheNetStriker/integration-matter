import * as uc from "@unfoldedcircle/integration-api";
import type { MatterBridgeDevices } from "./devices/device_factory.js";

export const driver = new uc.IntegrationAPI();

/**
 * Configured Matter bridges.
 * @type {Map<string, MatterBridgeDevices>}
 */
export const configuredDevices: Map<string, MatterBridgeDevices> = new Map<string, MatterBridgeDevices>();
export const subscribedEntities = new Map<string, boolean>();

export const isRunningOnRemote = process.env.UC_MODEL != undefined;
