# Local NPM repository

A local NPM repository is used to test publish scripts against an actual repository. A Nexus docker container allows
 a production-like test environment to which monorepo projects can be published.
 
## Running Nexus

Nexus runs in a docker container using docker-compose. It requires that both docker and docker-compose are
 installed on the host system.
 
Start the Nexus container:

`docker-compose up`

Connect to the repository:

[http://localhost:8081](http://localhost:8081)

Credentials

* *Username*: admin
* *Password*: admin123

For more information on the Nexus docker image visit [sonatype/nexus](https://hub.docker.com/r/sonatype/nexus/) in 
 the docker hub.

## Publishing to local Nexus

First, make sure you've created an npm registry. Follow 
 [these directions](https://blog.sonatype.com/using-nexus-3-as-your-repository-part-2-npm-packages)
 to create a local npm registry.

In brief, you will

* Sign in as admin
* Create a new npm (hosted) repository (name it `test`)
* Go to realms and add `npm Bearer Token Realm` (login wont work otherwise)

Then login -- in this example we created a registry named `test`

`npm login --registry "npm login --registry "http://localhost:8081/repository/test/"`

Publishing to a local registry can be done by passing registry properties to npm.

`npm run pub -- --registry http://localhost:8081/repository/test/`

You can force lerna to publish a specific package, even it it has not been changed by using `force-publish`.
 
 `npm run pub -- --registry http://localhost:8081/repository/test/ --force-publish=\@dojo/core`

This will run the publish script against only `@dojo/core` and publish it to npm regardless of whether it's been 
 updated.
