let savedSmoochApps = [];
let savedSmoochIntegrations = [];

const initialItems = [
  {
    created: '2020-03-19T03:53:42.116Z',
    'webhook-id': '5e72ecc60ace4e000f1f1c72',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '1',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    name: 'app1',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    type: 'app',
    updated: '2020-03-19T03:53:42.116Z',
  },
  {
    created: '2020-03-19T03:53:42.116Z',
    'webhook-id': '5e72ecc60ace4e000f1f1c72',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '2',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    name: 'app2',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    type: 'app',
    updated: '2020-03-19T03:53:42.116Z',
  },
  {
    created: '2020-03-19T03:53:42.116Z',
    'webhook-id': '5e72ecc60ace4e000f1f1c72',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '3',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    name: 'app3',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    type: 'app',
    updated: '2020-03-19T03:53:42.116Z',
  },
  {
    created: '2020-03-19T03:53:42.116Z',
    'webhook-id': '5e72ecc60ace4e000f1f1c72',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '4',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    name: 'app4',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    type: 'app',
    updated: '2020-03-19T03:53:42.116Z',
  },
  {
    'contact-point': 'pepe',
    created: '2020-03-30T19:09:02.648Z',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '5',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    'app-id': '1',
    name: 'example',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    updated: '2020-03-30T19:09:02.648Z',
    type: 'web',
    'client-disconnect-minutes': 3600,
  },
  {
    'contact-point': 'pepe',
    created: '2020-03-30T19:09:02.648Z',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '6',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    'app-id': '2',
    name: 'example',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    updated: '2020-03-30T19:09:02.648Z',
    description: 'test2',
    type: 'web',
  },
  {
    'contact-point': 'pepe',
    created: '2020-03-30T19:09:02.648Z',
    'tenant-id': 'ae3a8d5a-8ece-4308-8812-63639cda3a22',
    id: '7',
    'updated-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    'app-id': '3',
    name: 'example',
    'created-by': '7a436cd0-1126-11ea-9dea-25d8fc8b2383',
    updated: '2020-03-30T19:09:02.648Z',
    type: 'web',
    'client-disconnect-minutes': 3600,
  },
];

const mockGetSecretValue = jest.fn(() => { })
  .mockImplementation(() => ({
    promise: () => {
      const apps = initialItems.filter((item) => item.type === 'app');
      const appKeys = {};
      apps.forEach(({ id: appId }, index) => {
        appKeys[`${appId}-id`] = index;
        appKeys[`${appId}-id-old`] = index;
        appKeys[`${appId}-secret-old`] = index;
        appKeys[`${appId}-secret`] = index;
      });

      return {
        SecretString: JSON.stringify(appKeys),
      };
    },
  }));

const mockCreateApp = jest.fn()
  .mockImplementation((body) => {
    const newApp = {
      app: {
        _id: Math.floor(Math.random() * 100000) + 1,
        ...body,
      },
    };
    savedSmoochApps.push(newApp);

    return newApp;
  });

const mockDeleteApp = jest.fn()
  .mockImplementation(() => ({}));

const mockDeleteIntegration = jest.fn()
  .mockImplementation(() => ({}));

const mockCreateIntegration = jest.fn()
  .mockImplementation((_, body) => {
    const newIntegration = {
      integration: {
        _id: Math.floor(Math.random() * 100000) + 1,
        ...body,
      },
    };
    savedSmoochIntegrations.push(newIntegration);

    return newIntegration;
  });

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

const mockGetSmoochApp = jest.fn()
  .mockImplementation((appId) => ({
    app: {
      _id: appId,
      name: `Test ${appId}`,
      settings: {
        maskCreditCardNumbers: true,
        useAnimalNames: false,
        conversationRetentionSeconds: 15000,
        echoPostback: false,
      },
    },
  }));

const mockGetSmoochIntegration = jest.fn()
  .mockImplementation(({ interactionId }) => (
    {
      integration: {
        _id: interactionId,
        status: 'active',
        type: 'web',
        displayName: 'Web Messenger',
        prechatCapture: {
          fields: [
            {
              maxSize: 128,
              minSize: 1,
              placeholder: '',
              label: 'Email',
              name: 'email',
              type: 'email',
            },
          ],
          enabled: true,
        },
        integrationOrder: [],
        displayStyle: 'button',
        actionColor: '0099ff',
        conversationColor: '0099ff',
        brandColor: '65758e',
      },
    }));

const mockPut = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockDelete = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockUpdate = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockScan = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Items: initialItems,
    }),
  }));

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

global.Date.prototype.toISOString = jest.fn(() => 'January 1 1970');

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
    putSecretValue: mockPutSecretValue,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      put: mockPut,
      scan: mockScan,
      delete: mockDelete,
      update: mockUpdate,
    })),
  },
}));

const mockSmoochCore = jest.fn(() => ({
  apps: {
    keys: {
      create: mockKeysCreate,
    },
    create: mockCreateApp,
    get: mockGetSmoochApp,
    delete: mockDeleteApp,
  },
  integrations: {
    create: mockCreateIntegration,
    get: mockGetSmoochIntegration,
    delete: mockDeleteIntegration,
  },
  webhooks: { create: mockWebhookCreate },
}));

jest.mock('smooch-core', () => mockSmoochCore);
const { handler } = require('../index');

describe('recreate-smooch-apps', () => {
  beforeAll(async () => {
    jest.clearAllMocks();
  });
  describe('everything is successful', () => {
    it('Recreate the apps successfully', async () => {
      const result = await handler();
      expect(result).toMatchSnapshot();
    });

    it('when secret-old and secret is not provided', async () => {
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            id: 'app-id',
            secret: 'SECRET',
          }),
        }),
      }));
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            id: 'app-id',
            secret: 'SECRET',
          }),
        }),
      }));
      mockGetSecretValue.mockImplementationOnce(() => ({
        promise: () => ({
          SecretString: JSON.stringify({
            '1-id': 'id',
            '1-id-old': 'id-old',
            id: 'app-id',
            secret: 'SECRET',
          }),
        }),
      }));
      const result = await handler();
      expect(result).toMatchSnapshot();
    });
    describe('walkthrough', () => {
      beforeAll(async () => {
        savedSmoochApps = [];
        savedSmoochIntegrations = [];
        jest.clearAllMocks();
        await handler();
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

      it('passes in the correct arguments to smooch.apps.get()', async () => {
        expect(mockGetSmoochApp.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.apps.create()', async () => {
        expect(mockCreateApp.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.apps.keys.create()', async () => {
        expect(mockKeysCreate.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.integrations.create()', async () => {
        expect(mockCreateIntegration.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.integrations.get()', async () => {
        expect(mockGetSmoochIntegration.mock.calls).toMatchSnapshot();
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

      it('passes in the correct arguments to docClient.delete()', async () => {
        expect(mockDelete.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.scan()', async () => {
        expect(mockScan.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.update()', async () => {
        expect(mockDelete.mock.calls).toMatchSnapshot();
      });

      it('creates all the integrations from the DB', () => {
        const dbIntegrations = initialItems.filter((item) => item.type === 'web');
        expect(dbIntegrations.length).toEqual(savedSmoochIntegrations.length);
      });

      it('creates all the apps from the DB', () => {
        const dbApps = initialItems.filter((item) => item.type === 'app');
        expect(dbApps.length).toEqual(savedSmoochApps.length);
      });
    });
  });

  it('throws an error when there is a problem scanning data from DB', async () => {
    try {
      mockScan.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred trying to fetch apps in DynamoDB'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving Smooch app', async () => {
    try {
      mockGetSmoochApp.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred retrieving an App'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem creating smooch app', async () => {
    jest.clearAllMocks();
    try {
      mockCreateApp.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred trying to create an App'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem creating smooch app keys', async () => {
    try {
      mockKeysCreate.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred trying to create App credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving account credentials (1)', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving account credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving app credentials (2)', async () => {
    try {
      mockGetSecretValue
        .mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              id: 'app-id',
              secret: 'SECRET',
            }),
          }),
        }))
        .mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving app credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving app credentials (3)', async () => {
    try {
      mockGetSecretValue
        .mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              id: 'app-id',
              secret: 'SECRET',
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              id: 'app-id',
              secret: 'SECRET',
            }),
          }),
        }))
        .mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving app credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem put app credentials (2)', async () => {
    try {
      mockPutSecretValue
        .mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              username: 'username',
              password: 'password',
            }),
          }),
        }))
        .mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving app credentials (2)'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem putting credentials', async () => {
    try {
      mockPutSecretValue.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving putting credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem creating webhook', async () => {
    try {
      mockWebhookCreate.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error creating webhook'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem putting data to db', async () => {
    try {
      mockPut.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('Error creating app into DynamoDB'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem retrieving Smooch integration', async () => {
    try {
      mockGetSmoochIntegration.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred retrieving an integration'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem deleting Smooch integration', async () => {
    try {
      mockDeleteIntegration.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred deleting an integration'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem deleting Smooch integration from DynamoDB', async () => {
    try {
      mockDelete.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred deleting an integration from DynamoDB'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem creating Smooch integration', async () => {
    try {
      mockCreateIntegration.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred creating an integration'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem creating Smooch integration from DynamoDB', async () => {
    try {
      mockUpdate.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred creating an integration from DynamoDB'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem deleting Smooch app from DynamoDB', async () => {
    try {
      mockDelete
        .mockImplementationOnce(() => ({
          promise: () => ({}),
        }))
        .mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred deleting an app from DynamoDB'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem deleting Smooch app (1)', async () => {
    try {
      mockDeleteApp.mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred deleting an app'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem deleting Smooch app (2)', async () => {
    try {
      mockDeleteApp
        .mockImplementationOnce(() => ({}))
        .mockRejectedValueOnce(new Error());
      await handler();
    } catch (error) {
      expect(Promise.reject(new Error('An Error has occurred deleting an app'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
