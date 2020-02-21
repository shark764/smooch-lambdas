const axios = require('axios');
const uuidv1 = require('uuid/v1');

jest.mock('axios');
jest.mock('uuid/v1');

uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e46');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
};

const event = {
  Records: [{
    body: JSON.stringify({
      appId: '5e31c81640a22c000f5d7f28',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      tenantId: '66d83870-30df-4a3b-8801-59edff162034',
    }),
  }],
};

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'username',
        password: 'password',
      }),
    }),
  }));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
}));

axios.mockImplementation(() => ({
  data: {
    source: 'smooch',
    interruptType: 'customer-disconnect',
    interrupt: {},
  },
}));

const { handler } = require('../index');

describe('end-interaction', () => {
  describe('Everthing is successful', () => {
    beforeAll(async () => {
      await handler(event);
    });
    it('passes in the correct arguments to mockGetSecretValue', async () => {
      expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
    });

    it('passes in the correct arguments to axios', async () => {
      expect(axios.mock.calls).toMatchSnapshot();
    });
  });

  it('throws an error when there is a problem retrieving cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is problem ending the interaction', async () => {
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error ending the interaction'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
