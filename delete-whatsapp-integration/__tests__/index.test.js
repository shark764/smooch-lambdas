const { lambda: { api: { validateTenantPermissions } } } = require('alonzo');

jest.mock('aws-sdk');
jest.mock('alonzo');

validateTenantPermissions.mockReturnValue(true);

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    id: '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7f28-id': 'id',
        '5e31c81640a22c000f5d7f28-secret': 'secret',
      }),
    }),
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: { 'app-id': '5e31c81640a22c000f5d7f28' },
    }),
  }));

const mockDelete = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockDeleteIntegration = jest.fn()
  .mockImplementation(() => ({}));


jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      delete: mockDelete,
    })),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
}));

const mockAuthentication = {
  basicAuth: {
    username: 'id',
    password: 'secret',
  },
};

jest.mock('sunshine-conversations-client', () => ({
  ApiClient: {
    instance: {
      authentications: mockAuthentication,
    },
  },
  IntegrationsApi: jest.fn().mockImplementation(() => ({
    deleteIntegration: mockDeleteIntegration,
  })),
}));

const { handler } = require('../index');

describe('delete-whatsapp-integration', () => {
  describe('Everthing is successful', () => {
    it('sends back status 200 when the whatsapp integration is deleted successfully', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.get()', async () => {
        expect(mockGet.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to sunshine conversation client deleteIntegration()', async () => {
        expect(mockDeleteIntegration.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.delete()', async () => {
        expect(mockDelete.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('sends back status 403 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there are invalid parameters', async () => {
    const mockEvent = {
      params: {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 404 when the integration does not exist for the tenant', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error fetching an app in DynamoDB', async () => {
    mockGet.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error parsing smooch credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error deleting records in DynamoDB', async () => {
    mockDelete.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a error deleting whatsapp integration', async () => {
    mockDeleteIntegration.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
