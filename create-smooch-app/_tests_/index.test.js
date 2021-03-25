const { lambda: { api: { validatePlatformPermissions } } } = require('alonzo');
const axios = require('axios');

jest.mock('alonzo');
jest.mock('axios');

validatePlatformPermissions.mockReturnValue(true);
global.Date.prototype.toISOString = jest.fn(() => 'January 1 1970');

axios.mockImplementation(() => ({
  data: {
    result: {
      active: true,
    },
  },
}));

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        id: '5e31c81640a22c000f5d7c55',
        secret: 'secret',
      }),
    }),
  }));

const mockCreate = jest.fn()
  .mockImplementation(() => ({
    app: {
      _id: '5e31c81640a22c000f5d7f28',
    },
  }));

const mockKeysCreate = jest.fn()
  .mockImplementation(() => ({
    key: {
      _id: '5e31c81640a22c000f5d7f29',
      secret: 'secret',
    },
  }));

const mockPutSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        id: '5e31c81640a22c000f5d7c60',
        secret: 'secret',
      }),
    }),
  }));

const mockWebhookCreate = jest.fn()
  .mockImplementation(() => ({
    webhook: {
      _id: '5e31c81640a22c000f5d7c70',
    },
  }));

const mockPut = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    auth: 'given-auth',
  },
  body: {
    name: 'smooch',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
    putSecretValue: mockPutSecretValue,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ put: mockPut })),
  },
}));

const mockSmoochCore = jest.fn(() => ({
  apps: {
    keys: {
      create: mockKeysCreate,
    },
    create: mockCreate,
  },
  webhooks: { create: mockWebhookCreate },
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('create-smooch-app', () => {
  describe('Everthing is successful', () => {
    it('sends back status 200 when smooch app is created successfuly', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
      it('passes in the correct arguments to validatePlatformPermissions', async () => {
        expect(validatePlatformPermissions.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-account',
        }]));
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.apps.create()', async () => {
        expect(mockCreate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.apps.keys.create()', async () => {
        expect(mockKeysCreate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretsClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-app',
        }]));
        expect(mockGetSecretValue.mock.calls[1]).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.putSecretValue()', async () => {
        expect(mockPutSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.webhooks.create()', async () => {
        expect(mockWebhookCreate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.put()', async () => {
        expect(mockPut.mock.calls).toMatchSnapshot();
      });
    });
  });
  it('sends back status 400 when there are invalid body values', async () => {
    const mockEvent = {
      params: {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
      body: {
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there are invalid param values', async () => {
    const mockEvent = {
      params: {
        'tenant-id': '',
      },
      body: {
        name: 'smooch',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there are not enough permissions', async () => {
    validatePlatformPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back satus 400 when tenant is not found or is inactive', async () => {
    axios.mockImplementationOnce(() => ({
      data: {
        result: {
          active: false,
        },
      },
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when tenant is not found', async () => {
    const error = {
      response: {
        status: 404,
      },
    };
    axios.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving tenant', async () => {
    const error = {
      response: {
        status: 400,
      },
    };
    axios.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error creating an app', async () => {
    mockCreate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error creating App credentials', async () => {
    mockKeysCreate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status error 500 when there is a error (1) saving app credentials ', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          id: 'id',
          secert: 'secret',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error (2) saving app credentials', async () => {
    mockPutSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error creating webhooks', async () => {
    mockWebhookCreate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error saving records in DynamoDB', async () => {
    mockPut.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
