# Matter integration for Unfolded Circle Remote Two and 3

This integration lets you control home automation systems using the Matter protocol on the Unfolded Circle Remote Two and 3.

This integration uses the excellent [matter-js](https://github.com/matter-js/matter.js) library in the background.

The idea behind this project is that with this one integration all home automation systems that support Matter can be controlled. So there does not have to be a separate integration for every system.

I also found out that the Matter protocol is very efficient because it is using the UDP protocol. So there is no need to open a TCP connection every time the remote wakes up. You can basically use the commands of this implementation as soon as the display of the remote turns on if the integration is running directly on the remote. So maybe this would also be interesting for HomeAssistant users who are using the official HomeAssistant integration.

This integration is currently only tested with OpenHAB 5.0 and the HomeAssistant Matter Hub because I don't have any other Matter compatible home automation systems to test this. Also currently only a small selection of device types is supported.

If you want to help out to test other systems please contact me on GitHub or in the Unfolded Circle Discord community projects chat in the matter integration discussion.

## Supported devices

At the moment only switches, HSB lights temperature and humidity sensors are supported. If you need other devices please contact me.

## Installation

### Installation on the Remote (recommended)

This is the recommended installation because it is easy and works very good for me. But maybe performance could suffer if a lot of devices are added. For this I create the Docker installation.

The integration can be installed locally on the Remote 3, but so far I've only tested this will about 15 end devices.

The integration cannot currently only be installed if the Remote is running the current beta version of Unfolded OS because the matter library requires at least NodeJS 20 to work.

- Download the release from the release section : file ending with `.tar.gz`
- Navigate into the Web Configurator of the remote, go into the `Integrations` tab, click on `Add new` and select : `Install custom`
- Select the downloaded `.tar.gz` file and click on upload
- Once uploaded, the new integration should appear in the list. Click on it, select next and wait for the matter controller to initialize.

#### Update on the Remote

To update to the lastest version of the remote follow these steps:

- Delete the integration from the remote. If entities where already added the integration has to be deleted twice.
- Wait for the integration to dissapear. (Takes about a minute)
- Download the release from the release section : file ending with `.tar.gz`
- Navigate into the Web Configurator of the remote, go into the `Integrations` tab, click on `Add new` and select : `Install custom`
- Select the downloaded `.tar.gz` file and click on upload
- Once the integration shows wait for a few seconds then start the setup.
- The setup will automatically recognize if a previous configuration exists and skip the Matter setup step.

#### Reset configuration

Per default the configuration is not deleted when a new version of the integration is uploaded. If there is a major problem with the integraion you can upload the `-reset.tar.gz` version of the interation. This file just contains an addional file in the config directory that triggers the deletion of the config directory at startup.

This file should only be used if the integration does not respond anymore. Normally everything should be configured in the setup of the integration. Matter devices can also be removed in the setup. By removing the device using the setup the integration can also inform the remote system about the removal.

### Running as Docker container

The integration can also be run as a Docker container. This could impact the response time until the integration is ready because it needs a TCP websocket connection to the remote and needs to update all devices when the remote is waking up. But it could maybe be the better way if a lot of devices are added.

To start the integration as a docker container just download the code and execute `docker compose up -d` in the directory. This will automatically build the docker image and start the integration. The integration should then be automatically be found over the network by the bonjour protocol.

You can also use Redis for the matter database. For this just run `docker-compose -f docker-compose-redis.yml up -d` in this directory.

If you also want the matter logo to appear the file has to be uploaded manually when using Docker because at the moment there is no way to upload files from an externally hosted integration.

#### Environment variables

The Docker container can be configured with several environment variables:

| Environment variable     | Description                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| UC_CONFIG_HOME           | Where to store config files. (not config files are used at the moment)                                         |
| UC_DATA_HOME             | Where to store settings and Matter database files.                                                             |
| UC_INTEGRATION_INTERFACE | Which IP Address should be used for the Remote API.                                                            |
| UC_INTEGRATION_HTTP_PORT | Which Port should be used for the Remote API.                                                                  |
| UC_DISABLE_MDNS_PUBLISH  | Disable Bonjour/Mdns advertisment to the remote.                                                               |
| MATTER_FABRIC_LABEL      | Default Matter Fabric Label. This only has to be changed if multiple instances of the integration are running. |
| MATTER_STORAGE           | I've tried multiple storage options for the Matter controller. Possible options see below.                     |

#### MATTER_STORAGE options

| Option            | Description                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| json (default)    | Single JSON file. Good balance between performance and disk usage.                                                                                                         |
| valkeyrie         | Valkeyrie key value database. (based on SQLite) Slightly worse performance and more disk usage as json, but could work better with a lot of devices.                       |
| file              | Each value is stored as a seaparate file. This is the main storage option of matter-js, but is also the slowest one and also requires the most disk space.                 |
| redis://127.0.0.1 | Store the matter database in a Redis database. Best option when running the integration in a Docker container, but no file that can easly be looked at with a text editor. |

## Setup

The setup will first ask for the driver settings and then for a pairing code. In the driver settings you can change the Matter fabric label. This is only needed if more than one instance of the integration is used with the same matter device. The pairing code you can get from your home automation system. The home automation system should also allow commissioning for the pairing to work.

After pairing has finished the matter devices are discovered in the background. This can take a few seconds or a few minutes, depending on the amount of devices. You can just refresh the browser a few times an check if the entites have been added.

After the initial setup there are multiple configuration options:

| Option                                          | Description                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light transition time in tenths of a second     | Not supported by OpenHAB and also does not seem to work with HomeAssistant Matter Hub. But maybe this works with other home automation systems                                                                                    |
| Add new matter device                           | Enter another pairing code to pair to another matter device.                                                                                                                                                                      |
| Driver configuration                            | Configure light transition time, matter fabric label, temperature unit and debug levels. Only set the debug level of the Matter log level higher if really needed. It generates a lot of log messages and can impact performance. |
| Generate pairing code for another Matter device | Generates a pairing code to for another device to add the same matter device as selected in the dropdown.                                                                                                                         |
| Matter structure debug output                   | Outputs the whole structure of the matter device to a textbox in the browser. This is useful to debug problems with matter devices.                                                                                               |
| Decommission matter device                      | Cleanly removes the matter device from the integration. This also informs the remote system about the removal. This will not work if the remote system is offline.                                                                |
| Force remove matter device                      | This option should only be used if the remote system does not work or was reset to factory configuration.                                                                                                                         |
| Reset configuration                             | This option should only be used as a last resort if nothing is working anymore. This will wipe the whole matter configuration and setup a new matter controller.                                                                  |

### OpenHAB

For OpenHAB the Matter addon has to installed and setup first: https://www.openhab.org/addons/bindings/matter/

After installation of the addon go to settings/addons/binding-matter in the browser of your OpenHAB instance and copy the pairing code from there.

## Debugging

The integration can be started using Visual Studio code debugger.

### Access

After startup, the integration is available at `ws://localhost:9988` and can be configured in Remote Two/Three.

# License

This project is licensed under the [**Mozilla Public License 2.0**](https://choosealicense.com/licenses/mpl-2.0/).
See the [LICENSE](LICENSE) file for details.
