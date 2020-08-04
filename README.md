# @ffz/link-service

[![NPM Version](https://img.shields.io/npm/v/@ffz/link-service.svg?style=flat)](https://npmjs.org/package/@ffz/link-service)
[![Dependency Status](https://img.shields.io/david/frankerfacez/link-service.svg?style=flat)](https://david-dm.org/frankerfacez/link-service)

Link resolver service for [FrankerFaceZ](https://www.frankerfacez.com/).

- Supports site-specific modules for refining responses
- Falls back to `<meta>` tags and HTML scraping if necessary
- Keeps track of page redirects
- Checks pages against Google SafeBrowsing (if configured)
- Support for caching, integrated with redirect handling

* * *

## Install

```bash
$ npm install @ffz/link-service --save
```

## Getting Started

There's a built-in tool that both provides an interactive shell and
that runs an HTTPS server the client can communicate with for testing.
To start it, just run:

```bash
$ npm start
```

By default, this will start the HTTPS server listening on port 8002
with a self-signed certificate. In order to use this server for
developing with FrankerFaceZ, you'll need to ensure your browser will
accept self-signed certificates for localhost. That may involve
visiting [https://localhost:8002](https://localhost:8002) in your
browser and making an exception for the certificate.

Once you've done that, you can go to `Debugging > Data Sources` in
the FrankerFaceZ client and change the `Link Resolver` to `localhost`
to start making requests to the local server.

At that point, you just pick a URL for testing or enter a custom
URL and you go to work implementing your custom resolver.

### Configuration

If you create a file named `config.json`, that file will be used to
configure the `LinkService` instance from the shell script. You should
use this file to install API keys for local testing, if necessary.


## Remaining Tasks

* Finish Documentation
* Write Tests


## Documentation

* [API Documentation](https://frankerfacez.github.io/Link-Service/)

## Tests

Run tests using `npm test`.

## Contributions and Support

Please submit all issues and pull requests to the [FrankerFaceZ/link-service](https://github.com/frankerfacez/link-service) repository.