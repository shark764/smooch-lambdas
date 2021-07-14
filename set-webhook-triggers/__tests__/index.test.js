jest.mock('aws-sdk');
jest.mock('smooch-core/lib/smooch');

const mockGetSecretValue = jest
  .fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        id: 'id',
        secret: 'secret',
      }),
    }),
  }));

const mockScanPromise = jest.fn().mockImplementation(() => ({
  Items: [
    { id: 'app-id', type: 'app', 'webhook-id': 'webhook-id' },
    { id: 'app-id', type: 'app', 'webhook-id': 'webhook-id' },
  ],
}));
const mockScan = jest.fn().mockImplementation(() => ({
  promise: mockScanPromise,
}));

const event = {};

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: jest
      .fn()
      .mockImplementation(() => ({ promise: jest.fn().mockImplementation(() => ({ QueueUrl: 'url://testurl' })) })),
    sendMessage: jest.fn().mockImplementation(() => ({ promise: jest.fn() })),
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      scan: mockScan,
    })),
  },
}));

const mockSmoochUpdate = jest.fn().mockImplementation(() => ({
  promise: () => ({}),
}));

const mockSmoochCore = jest.fn(() => ({
  webhooks: {
    update: mockSmoochUpdate,
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('set-webhook-triggers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('Everything is successful', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('returns when the code runs without any error', async () => {
      const result = handler(event);
      expect(result).toBeTruthy();
    });

    describe('Walkthrough', () => {
      beforeEach(async () => {
        await handler(event);
      });

      it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to docClient.scan()', async () => {
        expect(mockScan.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to smooch.apps.update()', async () => {
        expect(mockSmoochUpdate.mock.calls).toMatchSnapshot();
      });
    });
  });

  it('throws an error when there is a error scanning apps in DynamoDB', async () => {
    mockScanPromise.mockRejectedValueOnce(new Error('An Error has occurred trying to fetch apps in DynamoDB'));
    await expect(handler(event)).rejects.toMatchSnapshot();
  });

  it('throws an error when there is a problem updating Smooch webhook', async () => {
    mockSmoochUpdate.mockRejectedValueOnce(new Error());
    await expect(handler(event)).rejects.toMatchSnapshot();
  });
});
