'use strict';

const mongoose = require('mongoose');

const DATASET_ID_RE =
  /^[a-z0-9][a-z0-9._-]{2,127}$/;

const GIT_COMMIT_RE =
  /^[0-9a-f]{40}$/;

const SHA256_RE =
  /^[0-9a-f]{64}$/;

class PayloadContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PayloadContractError';
  }
}

function requiredString(label) {
  return {
    type: String,
    required: [true, `${label} is required`],
    trim: true,
    minlength: [1, `${label} must not be empty`],
  };
}

function safeIntegerAtLeast(minimum, label) {
  return {
    validator(value) {
      return (
        Number.isSafeInteger(value) &&
        value >= minimum
      );
    },
    message:
      `${label} must be a safe integer >= ${minimum}`,
  };
}

const physicsParamsSchema =
  new mongoose.Schema(
    {
      sqrt_s_gev: {
        type: Number,
        required: true,
        validate: {
          validator(value) {
            return (
              Number.isFinite(value) &&
              value > 0
            );
          },
          message:
            'sqrt_s_gev must be finite and > 0',
        },
      },

      pileup_mu: {
        type: Number,
        required: true,
        validate: {
          validator(value) {
            return (
              Number.isFinite(value) &&
              value >= 0
            );
          },
          message:
            'pileup_mu must be finite and >= 0',
        },
      },

      pileup_model: {
        type: String,
        required: true,
        enum: ['poisson'],
      },
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const generatorSchema =
  new mongoose.Schema(
    {
      name: requiredString('generator.name'),
      version:
        requiredString('generator.version'),

      seed: {
        type: Number,
        required: true,
        validate:
          safeIntegerAtLeast(
            0,
            'generator.seed'
          ),
      },
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const transportSchema =
  new mongoose.Schema(
    {
      name: requiredString('transport.name'),
      version:
        requiredString('transport.version'),
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const runSchema =
  new mongoose.Schema(
    {
      event_count: {
        type: Number,
        required: true,
        validate:
          safeIntegerAtLeast(
            1,
            'run.event_count'
          ),
      },

      bunch_crossing_count: {
        type: Number,
        required: true,
        validate:
          safeIntegerAtLeast(
            1,
            'run.bunch_crossing_count'
          ),
      },
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const provenanceSchema =
  new mongoose.Schema(
    {
      git_repository:
        requiredString(
          'provenance.git_repository'
        ),

      git_commit: {
        ...requiredString(
          'provenance.git_commit'
        ),
        match: [
          GIT_COMMIT_RE,
          'git_commit must be 40 lowercase hexadecimal characters',
        ],
      },

      config_sha256: {
        ...requiredString(
          'provenance.config_sha256'
        ),
        match: [
          SHA256_RE,
          'config_sha256 must be 64 lowercase hexadecimal characters',
        ],
      },
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const artifactsSchema =
  new mongoose.Schema(
    {
      manifest_path:
        requiredString(
          'artifacts.manifest_path'
        ),

      manifest_sha256: {
        ...requiredString(
          'artifacts.manifest_sha256'
        ),
        match: [
          SHA256_RE,
          'manifest_sha256 must be 64 lowercase hexadecimal characters',
        ],
      },
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const validationSchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        required: true,
        enum: [
          'pending',
          'validated',
          'rejected',
          'deprecated',
        ],
      },

      validated_at: {
        type: Date,
        default: null,
      },
    },
    {
      _id: false,
      strict: 'throw',
    }
  );

const simulationSchema =
  new mongoose.Schema(
    {
      schema_version: {
        type: String,
        required: true,
        enum: ['1.0.0'],
        immutable: true,
      },

      dataset_id: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
        match: [
          DATASET_ID_RE,
          'dataset_id format is invalid',
        ],
      },

      dataset_type: {
        type: String,
        required: true,
        enum: ['minimum-bias'],
      },

      hf_repo:
        requiredString('hf_repo'),

      root_path:
        requiredString('root_path'),

      physics_params: {
        type: physicsParamsSchema,
        required: true,
      },

      generator: {
        type: generatorSchema,
        required: true,
      },

      transport: {
        type: transportSchema,
        required: true,
      },

      run: {
        type: runSchema,
        required: true,
      },

      provenance: {
        type: provenanceSchema,
        required: true,
      },

      artifacts: {
        type: artifactsSchema,
        required: true,
      },

      validation: {
        type: validationSchema,
        required: true,
      },

      description: {
        type: String,
        trim: true,
        default: '',
      },
    },
    {
      strict: 'throw',
      versionKey: false,

      timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    }
  );

simulationSchema.index(
  {
    hf_repo: 1,
    root_path: 1,
  },
  {
    unique: true,
    name: 'uniq_hf_repo_root_path',
  }
);

simulationSchema.index(
  {
    dataset_type: 1,
    'physics_params.sqrt_s_gev': 1,
    'physics_params.pileup_mu': 1,
  },
  {
    name: 'physics_lookup',
  }
);

simulationSchema.index(
  {
    'provenance.git_commit': 1,
  },
  {
    name: 'git_commit_lookup',
  }
);

const Simulation =
  mongoose.models.Simulation ||
  mongoose.model(
    'Simulation',
    simulationSchema
  );

function assertObject(value, path) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new PayloadContractError(
      `${path} must be an object`
    );
  }
}

function rejectUnknown(
  value,
  allowed,
  path
) {
  assertObject(value, path);

  const allowedSet =
    new Set(allowed);

  const unknown =
    Object.keys(value)
      .filter(
        key => !allowedSet.has(key)
      );

  if (unknown.length !== 0) {
    throw new PayloadContractError(
      `${path} contains unknown fields: ` +
      unknown.join(', ')
    );
  }
}

function assertStringValue(value, path) {
  if (typeof value !== 'string') {
    throw new PayloadContractError(
      `${path} must be a string`
    );
  }
}

function assertFiniteNumberValue(value, path) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new PayloadContractError(
      `${path} must be a finite number`
    );
  }
}

function assertSafeIntegerValue(value, path) {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value)
  ) {
    throw new PayloadContractError(
      `${path} must be a safe integer`
    );
  }
}

function assertNullableDateValue(value, path) {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new PayloadContractError(
      `${path} must be null or a valid date string`
    );
  }
}

function validatePrimitiveTypes(input) {
  const strings = [
    [input.schema_version, 'schema_version'],
    [input.dataset_id, 'dataset_id'],
    [input.dataset_type, 'dataset_type'],
    [input.hf_repo, 'hf_repo'],
    [input.root_path, 'root_path'],
    [
      input.physics_params.pileup_model,
      'physics_params.pileup_model'
    ],
    [
      input.generator.name,
      'generator.name'
    ],
    [
      input.generator.version,
      'generator.version'
    ],
    [
      input.transport.name,
      'transport.name'
    ],
    [
      input.transport.version,
      'transport.version'
    ],
    [
      input.provenance.git_repository,
      'provenance.git_repository'
    ],
    [
      input.provenance.git_commit,
      'provenance.git_commit'
    ],
    [
      input.provenance.config_sha256,
      'provenance.config_sha256'
    ],
    [
      input.artifacts.manifest_path,
      'artifacts.manifest_path'
    ],
    [
      input.artifacts.manifest_sha256,
      'artifacts.manifest_sha256'
    ],
    [
      input.validation.status,
      'validation.status'
    ],
  ];

  for (const [value, path] of strings) {
    assertStringValue(value, path);
  }

  assertFiniteNumberValue(
    input.physics_params.sqrt_s_gev,
    'physics_params.sqrt_s_gev'
  );

  assertFiniteNumberValue(
    input.physics_params.pileup_mu,
    'physics_params.pileup_mu'
  );

  assertSafeIntegerValue(
    input.generator.seed,
    'generator.seed'
  );

  assertSafeIntegerValue(
    input.run.event_count,
    'run.event_count'
  );

  assertSafeIntegerValue(
    input.run.bunch_crossing_count,
    'run.bunch_crossing_count'
  );

  assertNullableDateValue(
    input.validation.validated_at,
    'validation.validated_at'
  );

  if (
    Object.hasOwn(
      input,
      'description'
    )
  ) {
    assertStringValue(
      input.description,
      'description'
    );
  }
}

function buildSimulationPayload(input) {
  rejectUnknown(
    input,
    [
      'schema_version',
      'dataset_id',
      'dataset_type',
      'hf_repo',
      'root_path',
      'physics_params',
      'generator',
      'transport',
      'run',
      'provenance',
      'artifacts',
      'validation',
      'description',
    ],
    'payload'
  );

  rejectUnknown(
    input.physics_params,
    [
      'sqrt_s_gev',
      'pileup_mu',
      'pileup_model',
    ],
    'physics_params'
  );

  rejectUnknown(
    input.generator,
    [
      'name',
      'version',
      'seed',
    ],
    'generator'
  );

  rejectUnknown(
    input.transport,
    [
      'name',
      'version',
    ],
    'transport'
  );

  rejectUnknown(
    input.run,
    [
      'event_count',
      'bunch_crossing_count',
    ],
    'run'
  );

  rejectUnknown(
    input.provenance,
    [
      'git_repository',
      'git_commit',
      'config_sha256',
    ],
    'provenance'
  );

  rejectUnknown(
    input.artifacts,
    [
      'manifest_path',
      'manifest_sha256',
    ],
    'artifacts'
  );

  rejectUnknown(
    input.validation,
    [
      'status',
      'validated_at',
    ],
    'validation'
  );

  validatePrimitiveTypes(input);

  const payload = {
    schema_version:
      input.schema_version,

    dataset_id:
      input.dataset_id,

    dataset_type:
      input.dataset_type,

    hf_repo:
      input.hf_repo,

    root_path:
      input.root_path,

    physics_params: {
      sqrt_s_gev:
        input.physics_params.sqrt_s_gev,

      pileup_mu:
        input.physics_params.pileup_mu,

      pileup_model:
        input.physics_params.pileup_model,
    },

    generator: {
      name:
        input.generator.name,

      version:
        input.generator.version,

      seed:
        input.generator.seed,
    },

    transport: {
      name:
        input.transport.name,

      version:
        input.transport.version,
    },

    run: {
      event_count:
        input.run.event_count,

      bunch_crossing_count:
        input.run.bunch_crossing_count,
    },

    provenance: {
      git_repository:
        input.provenance.git_repository,

      git_commit:
        input.provenance.git_commit,

      config_sha256:
        input.provenance.config_sha256,
    },

    artifacts: {
      manifest_path:
        input.artifacts.manifest_path,

      manifest_sha256:
        input.artifacts.manifest_sha256,
    },

    validation: {
      status:
        input.validation.status,

      validated_at:
        input.validation.validated_at ??
        null,
    },
  };

  if (
    Object.hasOwn(
      input,
      'description'
    )
  ) {
    payload.description =
      input.description;
  }

  return payload;
}

function classifySimulationError(error) {
  if (
    error instanceof
      PayloadContractError ||
    error?.name ===
      'ValidationError' ||
    error?.name ===
      'StrictModeError'
  ) {
    return 422;
  }

  if (error?.code === 11000) {
    return 409;
  }

  return 503;
}

function publicErrorForStatus(status) {
  if (status === 422) {
    return 'Invalid simulation payload';
  }

  if (status === 409) {
    return 'Simulation already exists';
  }

  return 'Database operation unavailable';
}

function simulationToApi(input) {
  const object =
    input &&
    typeof input.toObject === 'function'
      ? input.toObject()
      : { ...input };

  const physics = {
    ...(object.physics_params || {}),
  };

  if (
    physics.sqrt_s_gev !== undefined &&
    physics.energy_gev === undefined
  ) {
    physics.energy_gev =
      physics.sqrt_s_gev;
  }

  return {
    ...object,
    physics_params: physics,
  };
}

module.exports = {
  DATASET_ID_RE,
  GIT_COMMIT_RE,
  SHA256_RE,
  PayloadContractError,
  simulationSchema,
  Simulation,
  buildSimulationPayload,
  classifySimulationError,
  publicErrorForStatus,
  simulationToApi,
};
