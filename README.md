# zmta-webadmin

Web administration component for [ZoneMTA](https://github.com/zone-eu/zone-mta). Adds a lightweight web based wrapper around ZoneMTA HTTP API calls.

See screenshots [here](https://cloudup.com/c_TLoJ62sdY).

## Requirements

1. [ZoneMTA](https://github.com/zone-eu/zone-mta)
2. [Redis](https://redis.io/) – required for counters
3. [Mongodb](https://www.mongodb.com/) – required for logs
4. [delivery-counters](https://github.com/andris9/zonemta-delivery-counters) plugin for ZoneMTA

## Setup

1. Copy these files to the same server where ZoneMTA runs
2. Install dependencies by running `npm install --production`
3. Start the web interface server with `npm start`
4. Point your browser to http://localhost:8082

If you want to acces the administration page from outside current server then either modify configuration options or serve the page through Nginx or Apache.

**NB!** For the delivery counters and top destinations to work you should add [zonemta-delivery-counters](https://github.com/andris9/zonemta-delivery-counters) plugin for your ZoneMTA application. Also make sure that you use the same redis key prefix in ZoneMTA and in ZMTA-WebAdmin.

V2.0.0 handles historic logs by itself (this feature is disabled by default, set logserver.enabled=true in config to enable UDP server that can catch events from ZoneMTA), previous versions required an external unreleased logger server for this.

## License

European Union Public License 1.1 ([details](http://ec.europa.eu/idabc/eupl.html)) or later
