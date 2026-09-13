'use strict';

const {
  test,
} = require('node:test');

const assert =
  require('node:assert/strict');

const {
  PayloadContractError,
  simulationSchema,
  Simulation,
  buildSimulationPayload,
  classifySimulationError,
  publicErrorForStatus,
  simulationToApi,
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
      'minbias-pythia8-g4-001',

    dataset_type:
      'minimum-bias',

    hf_repo:
      'ncevidanes/minbias-reference',

    root_path:
      '/minimum-bias/run-001',

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
        'manifests/run-001.json',

      manifest_sha256:
        SHA256,
    },

    validation: {
      status: 'pending',
      validated_at: null,
    },

    description:
      'Scientific Schema v1 local fixture',
  };
}

test(
  'Scientific Schema v1 accepts the canonical minimum-bias payload',
  () => {
    const payload =
      buildSimulationPayload(
        validPayload()
      );

    const document =
      new Simulation(payload);

    const error =
      document.validateSync();

    assert.equal(
      error,
      undefined
    );

    assert.equal(
      document.schema_version,
      '1.0.0'
    );

    assert.equal(
      document.physics_params
        .sqrt_s_gev,
      13000
    );
  }
);

test(
  'payload whitelist rejects unknown top-level fields',
  () => {
    const payload =
      validPayload();

    payload.unexpected =
      'must-not-pass';

    assert.throws(
      () =>
        buildSimulationPayload(
          payload
        ),
      PayloadContractError
    );
  }
);

test(
  'payload whitelist rejects unknown nested fields',
  () => {
    const payload =
      validPayload();

    payload.generator.secret =
      'must-not-pass';

    assert.throws(
      () =>
        buildSimulationPayload(
          payload
        ),
      PayloadContractError
    );
  }
);

test(
  'input contract rejects missing scientific identity before Mongoose validation',
  () => {
    const payload =
      validPayload();

    delete payload.dataset_id;

    assert.throws(
      () =>
        buildSimulationPayload(
          payload
        ),
      PayloadContractError
    );
  }
);

test(
  'Mongoose schema independently requires scientific identity',
  () => {
    const payload =
      buildSimulationPayload(
        validPayload()
      );

    delete payload.dataset_id;

    const document =
      new Simulation(payload);

    const error =
      document.validateSync();

    assert.equal(
      error?.name,
      'ValidationError'
    );

    assert.ok(
      error.errors.dataset_id
    );
  }
);

test(
  'dataset_id format is strict',
  () => {
    const payload =
      validPayload();

    payload.dataset_id =
      'INVALID DATASET';

    const error =
      new Simulation(
        buildSimulationPayload(
          payload
        )
      ).validateSync();

    assert.equal(
      error?.name,
      'ValidationError'
    );

    assert.ok(
      error.errors.dataset_id
    );
  }
);

test(
  'scientific checksums and git commit are validated',
  () => {
    const payload =
      validPayload();

    payload.provenance.git_commit =
      'bad-sha';

    payload.artifacts
      .manifest_sha256 =
      'bad-sha256';

    const error =
      new Simulation(
        buildSimulationPayload(
          payload
        )
      ).validateSync();

    assert.equal(
      error?.name,
      'ValidationError'
    );

    assert.ok(
      error.errors[
        'provenance.git_commit'
      ]
    );

    assert.ok(
      error.errors[
        'artifacts.manifest_sha256'
      ]
    );
  }
);

test(
  'numeric scientific invariants are enforced',
  () => {
    const payload =
      validPayload();

    payload.physics_params
      .sqrt_s_gev = 0;

    payload.physics_params
      .pileup_mu = -1;

    payload.generator.seed =
      -1;

    payload.run.event_count =
      0;

    payload.run
      .bunch_crossing_count =
      0;

    const error =
      new Simulation(
        buildSimulationPayload(
          payload
        )
      ).validateSync();

    assert.equal(
      error?.name,
      'ValidationError'
    );

    assert.ok(
      error.errors[
        'physics_params.sqrt_s_gev'
      ]
    );

    assert.ok(
      error.errors[
        'physics_params.pileup_mu'
      ]
    );

    assert.ok(
      error.errors[
        'generator.seed'
      ]
    );

    assert.ok(
      error.errors[
        'run.event_count'
      ]
    );

    assert.ok(
      error.errors[
        'run.bunch_crossing_count'
      ]
    );
  }
);

test(
  'schema is strict and exposes the required indexes',
  () => {
    assert.equal(
      simulationSchema.options.strict,
      'throw'
    );

    const indexes =
      simulationSchema.indexes();

    const hasUniqueDatasetId =
      indexes.some(
        ([keys, options]) =>
          keys.dataset_id === 1 &&
          options.unique === true
      );

    const hasUniqueStorage =
      indexes.some(
        ([keys, options]) =>
          keys.hf_repo === 1 &&
          keys.root_path === 1 &&
          options.unique === true
      );

    assert.equal(
      hasUniqueDatasetId,
      true
    );

    assert.equal(
      hasUniqueStorage,
      true
    );
  }
);

test(
  'API error classification is deterministic and sanitized',
  () => {
    assert.equal(
      classifySimulationError(
        new PayloadContractError(
          'private-detail'
        )
      ),
      422
    );

    assert.equal(
      classifySimulationError({
        name: 'ValidationError',
      }),
      422
    );

    assert.equal(
      classifySimulationError({
        name: 'StrictModeError',
      }),
      422
    );

    assert.equal(
      classifySimulationError({
        code: 11000,
      }),
      409
    );

    assert.equal(
      classifySimulationError(
        new Error(
          'private-database-detail'
        )
      ),
      503
    );

    assert.equal(
      publicErrorForStatus(422),
      'Invalid simulation payload'
    );

    assert.equal(
      publicErrorForStatus(409),
      'Simulation already exists'
    );

    assert.equal(
      publicErrorForStatus(503),
      'Database operation unavailable'
    );
  }
);

test(
  'API compatibility exposes legacy energy_gev without changing canonical storage',
  () => {
    const api =
      simulationToApi({
        dataset_id:
          'minbias-pythia8-g4-001',

        physics_params: {
          sqrt_s_gev: 13000,
          pileup_mu: 2,
          pileup_model:
            'poisson',
        },
      });

    assert.equal(
      api.physics_params
        .sqrt_s_gev,
      13000
    );

    assert.equal(
      api.physics_params
        .energy_gev,
      13000
    );
  }
);
