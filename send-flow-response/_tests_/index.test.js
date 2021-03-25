const axios = require('axios');
const uuidv1 = require('uuid/v1');

jest.mock('axios');
jest.mock('uuid/v1');

uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e46');

const event = {
  Records: [{
    body: JSON.stringify({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      actionId: '667802d8-2260-436c-958a-2ee0f71f73f1',
      data: 'mock-data',
    }),
  }],
};

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'UserName',
        password: 'Password',
      }),
    }),
  }));

axios.mockImplementation();

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

const { handler } = require('../index');

describe('send-flow-response', () => {
  describe('Everything is successful', () => {
    it('returns when the code runs without any error', async () => {
      const result = handler(event);
      expect(result).toBeTruthy();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
      it('passes in the correct arguments to secretsClient.getSecretValue() to get cx credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
          SecretId: 'us-east-1-dev-smooch-cx',
        }]));
        expect(mockGetSecretValue.mock.calls[0]).toMatchSnapshot();
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls).toMatchSnapshot();
      });
    });
  });
  it('throws an error when there is a problem trying to retrieve cx credentials', async () => {
    try {
      mockGetSecretValue.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error retrieving cx credentials'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });

  it('throws an error when there is a problem sending action response', async () => {
    try {
      axios.mockRejectedValueOnce(new Error());
      await handler(event);
    } catch (error) {
      expect(Promise.reject(new Error('Error sending action response'))).rejects.toThrowErrorMatchingSnapshot();
    }
  });
});
