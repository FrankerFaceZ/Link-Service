# @ffz/link-service

[![NPM Version](https://img.shields.io/npm/v/@ffz/link-service.svg?style=flat)](https://npmjs.org/package/@ffz/link-service)

Link resolver service for [FrankerFaceZ](https://www.frankerfacez.com/).

- Supports site-specific modules for refining responses
- Falls back to `<meta>` tags and HTML scraping if necessary
- Keeps track of page redirects
- Support for safety checking individual URLs, including
  via Google SafeBrowsing if configured.
- Support for caching, integrated with redirect handling

* * *

## Use as a Dependency

```bash
$ npm install @ffz/link-service --save
```

```javascript
import LinkService from '@ffz/link-service';

const service = new LinkService(config);

const embed = await service.resolve(url);
```


## Getting Started Developing

This project uses the [pnpm](https://pnpm.io/) package manager. To get
everything you need:

1. Install node.js and [pnpm](https://pnpm.io/)
2. Run `pnpm install` within the project's directory.

From there, you can use pnpm to build the service from source by running
`pnpm build`, build documentation with `pnpm docs`, and start the
development tool.

The built-in development tool both provides an interactive shell and
that runs an HTTPS server the client can communicate with for testing.
To start it, just run:

```bash
$ pnpm start
```

By default, this will start the HTTPS server listening on port 8002
with a self-signed certificate. In order to use this server for
developing with FrankerFaceZ, you'll need to ensure your browser will
accept self-signed certificates for localhost. That may involve
visiting [https://localhost:8002](https://localhost:8002) in your
browser and making an exception for the certificate.

Once you've done that, you can use either the FrankerFaceZ client
itself or our documentation's [Testing Tool](https://docs.frankerfacez.com/dev/link-preview/tester)
to start making requests to the local server.

When using the FrankerFaceZ client, you'll need to open the control
center to `Debugging > Data Sources` and change the `Link Resolver`
to `Local Dev Server`.

When using the documentation Testing Tool, just change the `Provider`
to `Local Dev Server`.

At that point, you just pick a URL for testing or enter a custom
URL and you go to work implementing your custom resolver.


### Configuration

If you create a file named `config.json`, that file will be used to
configure the `LinkService` instance from the shell script. You should
use this file to install API keys for local testing, if necessary.


## Remaining Tasks

* Add more services
* Finish Documentation
* Write Tests


## Documentation

* [API Documentation](https://frankerfacez.github.io/Link-Service/)


## Tests

Run tests using `pnpm test`.


## Contributions and Support

Please submit all issues and pull requests to the [FrankerFaceZ/link-service](https://github.com/frankerfacez/link-service) repository.
