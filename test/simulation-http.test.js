'use strict';

const {
  test,
} = require('node:test');

const assert =
  require('node:assert/strict');

const {
  app,
} = require('../server');

const {
  Simulation,
} = require('../simulation');

const SHA256 =
  '0123456789abcdef0123456789abcdef' +
  '0123456789abcdef0123456789abcdef';

const GIT_SHA =
  '0123456789abcdef0123456789abcdef01234567';

function validPayload() {
  return {
    schema_version: '1.0.0',

    dataset_id:
      'minbias-pythia8-g4-http-001',

    dataset_type:
      'minimum-bias',

    hf_repo:
      'ncevidanes/minbias-http-fixture',

    root_path:
      '/minimum-bias/http-001',

    physics_params: {
      sqrt_s_gev: 13000,
      pileup_mu: 2,
      pileup_model: 'poisson',
    },

    generator: {
      name: 'Pythia8',
      version: '8.x',
      seed: 9512,
    },

    transport: {
      name: 'Geant4',
      version: '11.x',
    },

    run: {
      event_count: 1000,
      bunch_crossing_count: 500,
    },

    provenance: {
      git_repository:
        'ncevidanes/PythiaGeantOneStage',

      git_commit:
        GIT_SHA,

      config_sha256:
        SHA256,
    },

    artifacts: {
      manifest_path:
        'manifests/http-001.json',

      manifest_sha256:
        SHA256,
    },

    validation: {
      status: 'pending',
      validated_at: null,
    },

    description:
      'HTTP contract fixture',
  };
}

async function withServer(stubs, callback) {
  const originalSave =
    Simulation.prototype.save;

  const originalFind =
    Simulation.find;

  if (stubs.save) {
    Simulation.prototype.save =
      stubs.save;
  }

  if (stubs.find) {
    Simulation.find =
      stubs.find;
  }

  const server =
    app.listen(
      0,
      '127.0.0.1'
    );

  await new Promise(
    (resolve, reject) => {
      server.once(
        'listening',
        resolve
      );

      server.once(
        'error',
        reject
      );
    }
  );

  const base =
    `http://127.0.0.1:${server.address().port}`;

  try {
    await callback(base);
  } finally {
    Simulation.prototype.save =
      originalSave;

    Simulation.find =
      originalFind;

    await new Promise(
      resolve =>
        server.close(resolve)
    );
  }
}

async function postPayload(base, payload) {
  return fetch(
    `${base}/api/repository/register-hf`,
    {
      method: 'POST',

      headers: {
        'content-type':
          'application/json',
      },

      body:
        JSON.stringify(payload),
    }
  );
}

test(
  'HTTP valid scientific payload returns 201',
  async () => {
    await withServer(
      {
        save:
          async function saveStub() {
            return this;
          },
      },
      async base => {
        const response =
          await postPayload(
            base,
            validPayload()
          );

        assert.equal(
          response.status,
          201
        );

        assert.deepEqual(
          await response.json(),
          {
            message: 'OK',
            dataset_id:
              'minbias-pythia8-g4-http-001',
            schema_version:
              '1.0.0',
          }
        );
      }
    );
  }
);

test(
  'HTTP missing required dataset_id returns 422 before save',
  async () => {
    let saveCalls = 0;

    await withServer(
      {
        save:
          async function saveStub() {
            saveCalls += 1;
            return this;
          },
      },
      async base => {
        const payload =
          validPayload();

        delete payload.dataset_id;

        const response =
          await postPayload(
            base,
            payload
          );

        assert.equal(
          response.status,
          422
        );

        assert.deepEqual(
          await response.json(),
          {
            error:
              'Invalid simulation payload',
          }
        );

        assert.equal(
          saveCalls,
          0
        );
      }
    );
  }
);

test(
  'HTTP unknown field returns 422 before save',
  async () => {
    let saveCalls = 0;

    await withServer(
      {
        save:
          async function saveStub() {
            saveCalls += 1;
            return this;
          },
      },
      async base => {
        const payload =
          validPayload();

        payload.unexpected =
          'must-not-pass';

        const response =
          await postPayload(
            base,
            payload
          );

        assert.equal(
          response.status,
          422
        );

        assert.equal(
          saveCalls,
          0
        );
      }
    );
  }
);

test(
  'HTTP rejects numeric strings instead of Mongoose coercion',
  async () => {
    let saveCalls = 0;

    await withServer(
      {
        save:
          async function saveStub() {
            saveCalls += 1;
            return this;
          },
      },
      async base => {
        const payload =
          validPayload();

        payload.physics_params
          .sqrt_s_gev =
          '13000';

        payload.generator.seed =
          '9512';

        const response =
          await postPayload(
            base,
            payload
          );

        assert.equal(
          response.status,
          422
        );

        assert.equal(
          saveCalls,
          0
        );
      }
    );
  }
);

test(
  'HTTP duplicate maps to sanitized 409',
  async () => {
    await withServer(
      {
        save:
          async function saveStub() {
            const error =
              new Error(
                'private-duplicate-detail'
              );

            error.code = 11000;

            throw error;
          },
      },
      async base => {
        const response =
          await postPayload(
            base,
            validPayload()
          );

        assert.equal(
          response.status,
          409
        );

        const text =
          await response.text();

        assert.doesNotMatch(
          text,
          /private-duplicate-detail/
        );

        assert.deepEqual(
          JSON.parse(text),
          {
            error:
              'Simulation already exists',
          }
        );
      }
    );
  }
);

test(
  'HTTP database failure maps to sanitized 503',
  async () => {
    await withServer(
      {
        save:
          async function saveStub() {
            throw new Error(
              'private-database-detail'
            );
          },
      },
      async base => {
        const response =
          await postPayload(
            base,
            validPayload()
          );

        assert.equal(
          response.status,
          503
        );

        const text =
          await response.text();

        assert.doesNotMatch(
          text,
          /private-database-detail/
        );
      }
    );
  }
);

test(
  'GET keeps legacy energy_gev compatibility',
  async () => {
    await withServer(
      {
        find() {
          return {
            sort() {
              return this;
            },

            async lean() {
              return [
                {
                  dataset_id:
                    'minbias-pythia8-g4-http-001',

                  physics_params: {
                    sqrt_s_gev:
                      13000,

                    pileup_mu:
                      2,

                    pileup_model:
                      'poisson',
                  },
                },
              ];
            },
          };
        },
      },
      async base => {
        const response =
          await fetch(
            `${base}/api/repository/simulations`
          );

        assert.equal(
          response.status,
          200
        );

        const body =
          await response.json();

        assert.equal(
          body[0]
            .physics_params
            .sqrt_s_gev,
          13000
        );

        assert.equal(
          body[0]
            .physics_params
            .energy_gev,
          13000
        );
      }
    );
  }
);
