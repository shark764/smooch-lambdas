const axios = require('axios');
const uuidv1 = require('uuid/v1');

jest.mock('axios');
jest.mock('uuid/v1');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-smooch-api-url',
};
uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e46');

const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      source: 'source',
      metadata: 'metadata',
    }),
  }],
};

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'UserName',
        password: 'Password',
      }),
    }),
  }));

axios.mockImplementation(() => ({
  data: {},
}));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

const { handler } = require('../index');

describe('update-interaction-metadata', () => {
  describe('Everything is successful', () => {
    it('when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toBeUndefined();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
      it('passes in the correct arguments to secretsClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });
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

  it('throws an error when there is a problem updating interaction metadata', async () => {
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Failed to update interaction metadata'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
