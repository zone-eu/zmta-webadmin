# zmta-webadmin

Web administration component for [ZoneMTA](https://github.com/zone-eu/zone-mta). Adds a lightweight, web based wrapper (http service) around ZoneMTA HTTP API calls.

See screenshots [here](https://cloudup.com/c_TLoJ62sdY).

## Requirements

1. [ZoneMTA](https://github.com/zone-eu/zone-mta)
2. [Redis](https://redis.io/) – required for counters
3. [Mongodb](https://www.mongodb.com/) – required for logs
4. [delivery-counters](https://github.com/andris9/zonemta-delivery-counters) plugin for ZoneMTA

## Setup

1. Copy this repo's files to a folder in the same server where you have installed ZoneMTA.
2. Navigate to this folder and Install required dependencies by running `npm install --production`
3. Start the web interface server with `npm start`
4. Point your browser to http://localhost:8082

NOTE: This repository adds an http wrapper to serve the .js pages containing the needed functionality. You can optionally serve these pages using Nginx or Apache. By default the configuration is set so this service can only be accessed from the local machine (127.0.0.1) If you want to acces the administration page from outside current server you will have to edit the configuration file called default.toml, found within the /config subfolder on the installation folder you previously created to install this script.

In order to access the web interface from an external computer, you need to edit the "host" parameter.

Change this line:
host = "127.0.0.1" # set to false to listen on all interfaces
to this:
host = "0.0.0.0" # set to false to listen on all interfaces

**NB!** For the delivery counters and top destinations to work you should add [zonemta-delivery-counters](https://github.com/andris9/zonemta-delivery-counters) plugin for your ZoneMTA application. Also make sure that you use the same redis key prefix in ZoneMTA and in ZMTA-WebAdmin.

NOTE: If you installed ZoneMTA using the zone-mta-template (which is the default procedure in the [ZoneMTA] documentation) then zonemta-delivery-counters is already setup and configured for you by default.

V2.0.0 handles historic logs by itself (this feature is disabled by default, set logserver.enabled=true in config to enable UDP server that can catch events from ZoneMTA), previous versions required an external unreleased logger server for this.

## License

European Union Public License 1.1 ([details](http://ec.europa.eu/idabc/eupl.html)) or later
