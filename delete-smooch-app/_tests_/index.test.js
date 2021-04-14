const { lambda: { api: { validatePlatformPermissions } } } = require('alonzo');

jest.mock('alonzo');

validatePlatformPermissions.mockReturnValue(true);

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    id: '5e31c81640a22c000f5d7f28',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        id: 'app-id',
        secret: 'SECRET',
      }),
    }),
  }));

const mockList = jest.fn()
  .mockImplementation(() => ({
    integrations: {
      length: 0,
    },
  }));

const mockDelete = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockDeleteSmooch = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockPutSecretValue = jest.fn()
  .mockImplementation(() => ({
  }));

const mockSmoochCore = jest.fn(() => ({
  integrations: {
    list: mockList,
  },
  apps: {
    delete: mockDeleteSmooch,
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ delete: mockDelete })),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
    putSeceretValue: mockPutSecretValue,
  })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('delete-smooch-app', () => {
  describe('Everthing is successful', () => {
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
            '5e31c81640a22c000f5d7f28-id': 'id',
            '5e31c81640a22c000f5d7f28-id-old': 'id-old',
            id: 'app-id',
            secret: 'SECRET',
          }),
        }),
      }));
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    it('sends back status 200 when the app is deleted successfully', async () => {
      const result = await handler(event);
      expect(result).toMatchSnapshot();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to validatePlatformPermissions', async () => {
        expect(validatePlatformPermissions.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to secretsClient.getSecretValue()', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore()', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.integrations.list()', async () => {
        expect(mockList.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.delete()', async () => {
        expect(mockDelete.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.apps.delete()', async () => {
        expect(mockDeleteSmooch.mock.calls).toMatchSnapshot();
      });
    });
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

  it('sends back status 403 when there are not enough permissions', async () => {
    validatePlatformPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error validating digital channels credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when integrations are found for the app', async () => {
    mockList.mockImplementationOnce(() => ({
      integrations: {
        length: 1,
      },
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 400 when there is an error retrieving integrations', async () => {
    mockList.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error deleting records in DynamoDB', async () => {
    mockDelete.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error deleting the app', async () => {
    mockDeleteSmooch.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error deleting app keys', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          id: 'app-id',
          secret: 'SECRET',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error deleting app keys (thrown by putSecretValue)', async () => {
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
          '5e31c81640a22c000f5d7f28-id': 'id',
          '5e31c81640a22c000f5d7f28-id-old': 'id-old',
          '5e31c81640a22c000f5d7f28-secret-old': 'secret-old',
          '5e31c81640a22c000f5d7f28-secret': 'secret',
          id: 'app-id',
          secret: 'SECRET',
        }),
      }),
    }));
    mockPutSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });
});
