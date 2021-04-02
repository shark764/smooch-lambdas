/* eslint-disable import/no-extraneous-dependencies */

const axios = require('axios');
const { v1: uuidv1 } = require('uuid');

jest.mock('axios');
jest.mock('uuid');
uuidv1.mockImplementation(() => '7534c040-534d-11ea-8aa0-c32d6a748e97');
global.Math.abs = jest.fn(() => 123456789);

const mockGetSecretValue = jest.fn(() => {})
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'UserName',
        password: 'Password',
      }),
    }),
  }));

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Item: {
        InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
        LatestCustomerMessageTimestamp: 50,
        LatestAgentMessageTimestamp: 20,
      },
    }),
  }));

const mockDelete = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockGetSqsQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({ QueueUrl: 'queueurl' }),
  }));

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockUpload = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockPutObject = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockPublish = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

axios.mockImplementation(() => ({
  data: {
    appId: '5e31c81640a22c000f5d7f28',
    artifactId: '5e31c81640a22c000f5d7f70',
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      delete: mockDelete,
    })),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetSqsQueueUrl,
    sendMessage: mockSendMessage,
  })),
  S3: jest.fn().mockImplementation(() => ({
    upload: mockUpload,
    putObject: mockPutObject,
  })),
  SNS: jest.fn().mockImplementation(() => ({
    publish: mockPublish,
  })),
}));

axios.mockImplementation(() => ({
  data: {
    collectActions: [{
      actionId: 'actionId',
    }],
    participants: [{
      sessionId: 'mock-session-id-1',
      resourceId: 'mock-resource-id-1',
    },
    {
      sessionId: 'mock-session-id-2',
      resourceId: 'mock-resource-id-2',
    }],
    artifactId: 'mock-artifact-id',
    latestMessageSentBy: 'customer',
    files: [{
      metadata: {
        transcript: false,
      },
    }],
    appId: 'mock-app-id',
  },
}));

const {
  performCustomerDisconnect,
  deleteCustomerInteraction,
  createMessagingTranscript,
  sendEndingInteractionNotification,
  checkIfClientIsDisconnected,
  shouldCheckIfClientIsDisconnected,
  getClientInactivityTimeout,
  sendMessageToParticipants,
  getMetadata,
  disconnectClient,
  checkIfClientPastInactiveTimeout,
} = require('../commonFunctions');

const logContext = {
  tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
  interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
  smoochUserId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
};

const whatsappLogContext = {
  tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
  interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
  smoochUserId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
  source: 'whatsapp',
};

describe('checkIfClientIsDisconnected', () => {
  beforeAll(async () => {
    jest.clearAllMocks();
    await checkIfClientIsDisconnected({
      latestAgentMessageTimestamp: 50,
      disconnectTimeoutInMinutes: 10,
      userId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
      logContext,
    });
  });

  it('gets disconnect checker queue url correctly', async () => {
    expect(mockGetSqsQueueUrl.mock.calls).toMatchSnapshot();
  });

  it('sent to disconnect queue', async () => {
    expect(mockSendMessage.mock.calls).toMatchSnapshot();
  });
});

describe('performCustomerDisconnect', () => {
  describe('when everything is successful', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      result = await performCustomerDisconnect({ logContext, cxAuth: 'auth' });
    });

    it('finish successfully', async () => {
      expect(result).toMatchSnapshot();
    });

    it('calls customer-disconnect', async () => {
      expect(axios.mock.calls).toMatchSnapshot();
    });

    it('verify customer-disconnect', async () => {
      expect(axios.mock.calls[0]).toEqual(expect.arrayContaining([
        {
          auth: 'auth',
          data: {
            interrupt: {},
            interruptType: 'customer-disconnect',
            source: 'smooch',
          },
          method: 'post',
          url: 'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/interrupts?id=7534c040-534d-11ea-8aa0-c32d6a748e97',
        },
      ]));
    });
  });

  describe('when a 404 error occurs in during interrupt', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
    });
    it('handles 404 error', async () => {
      const error = {
        response: {
          status: 404,
        },
      };
      axios.mockRejectedValueOnce(error);
      const result = await performCustomerDisconnect({
        logContext,
        cxAuth: 'auth',
      });
      expect(result).toEqual('Already received a first customer disconnect');
    });
  });

  describe('when a non-404 error occurs in the interrupt', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
    });
    it('handles 400 error', async () => {
      const error = {
        response: {
          status: 400,
        },
      };
      axios.mockRejectedValueOnce(error);
      try {
        await performCustomerDisconnect({
          logContext,
          cxAuth: 'auth',
        });
      } catch (err) {
        expect(err.response.status).toEqual(400);
      }
    });
  });
});

describe('deleteCustomerInteraction', () => {
  describe('when everything is successful', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      result = await deleteCustomerInteraction({ logContext });
    });

    it('finish successfully', async () => {
      expect(result).toMatchSnapshot();
    });

    it('delete called succesfully', async () => {
      expect(mockDelete.mock.calls[0]).toMatchSnapshot();
    });

    it('verify delete', async () => {
      expect(mockDelete.mock.calls[0]).toEqual(expect.arrayContaining([
        {
          ConditionExpression: 'attribute_exists(SmoochUserId)',
          Key: {
            SmoochUserId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
          },
          TableName: 'us-east-1-dev-smooch-interactions',
        },
      ]));
    });
  });

  describe('when error occurs', () => {
    it('gets error on mock delete', async () => {
      jest.clearAllMocks();
      mockDelete.mockRejectedValueOnce(new Error());
      const result = await deleteCustomerInteraction({ logContext });
      expect(result).toMatchSnapshot();
    });
  });
});

describe('checkIfClientPastInactiveTimeout', () => {
  beforeAll(async () => {
    jest.clearAllMocks();
    await checkIfClientPastInactiveTimeout({ logContext });
  });

  it('finsih successfully', async () => {
    expect(mockGetSqsQueueUrl.mock.calls).toMatchSnapshot();
  });
});

describe('shouldCheckIfClientIsDisconnected', () => {
  describe('when everything is successful', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      result = await shouldCheckIfClientIsDisconnected({
        userId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
        logContext,
      });
    });

    it('passes true on success', async () => {
      expect(result).toEqual(true);
    });
  });

  describe('Error getting interaction record', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
    });

    it('Fail to get interation record', async () => {
      mockGet.mockRejectedValueOnce();
      try {
        await shouldCheckIfClientIsDisconnected({
          userId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
          logContext,
        });
      } catch (err) {
        expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });

  describe('No interaction item found', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({}),
      }));
      result = await shouldCheckIfClientIsDisconnected({
        userId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
        logContext,
      });
    });

    it('check interaction item value', async () => {
      expect(result).toEqual(false);
    });
  });

  describe('No agent or customer message timestamp', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
          },
        }),
      }));
      result = await shouldCheckIfClientIsDisconnected({
        userId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
        logContext,
      });
    });

    it('verify timestamp value', async () => {
      expect(result).toEqual(true);
    });
  });

  describe('when agent time is more than customer time', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
            LatestCustomerMessageTimestamp: 50,
            LatestAgentMessageTimestamp: 100,
          },
        }),
      }));
      result = await shouldCheckIfClientIsDisconnected({
        userId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
        logContext,
      });
    });

    it('calls agent time > customer time', async () => {
      expect(result).toEqual(false);
    });
  });
});

describe('getClientInactivityTimeout', () => {
  describe('Everything is successful - web', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            clientDisconnectMinutes: 50,
          },
        }),
      }));

      const mockLogContext = {
        tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
        interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
        smoochIntegrationId: '5e31c81640a22c000f5d7f28',
      };
      await getClientInactivityTimeout({
        logContext: mockLogContext,
      });
    });

    it('calls successfully', async () => {
      expect(mockGet.mock.calls).toMatchSnapshot();
    });

    it('verify call', async () => {
      expect(mockGet.mock.calls[0]).toEqual(expect.arrayContaining([
        {
          Key: {
            id: '5e31c81640a22c000f5d7f28',
            'tenant-id': '250faddb-9723-403a-9bd5-3ca710cb26e5',
          },
          TableName: 'us-east-1-dev-smooch',
        },
      ]));
    });
  });

  describe('No smooch interaction record', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
    });

    it('Error on getting record', async () => {
      mockGet.mockRejectedValueOnce();
      try {
        await getClientInactivityTimeout({ logContext });
      } catch (error) {
        expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });

  describe('No integration found', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({}),
      }));
      result = await getClientInactivityTimeout({ logContext });
    });

    it('record not found', async () => {
      expect(result).toBeUndefined();
    });
  });

  describe('Everything is successful - Whatsapp', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            'client-disconnect-minutes': 50,
            active: true,
          },
        }),
      }));
      result = await getClientInactivityTimeout({
        logContext: whatsappLogContext,
      });
    });

    it('Active whatsapp integration', async () => {
      expect(result).toMatchSnapshot();
    });

    it('check clientDisconnectMinutes', async () => {
      expect(result).toEqual(50);
    });
  });

  describe('Inactive whatsapp integration', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      mockGet.mockImplementationOnce(() => ({
        promise: () => ({
          Item: {
            InteractionId: '66d83870-30df-4a3b-8801-59edff162070',
            clientDisconnectMinutes: 50,
          },
        }),
      }));
      result = await getClientInactivityTimeout({
        logContext: whatsappLogContext,
      });
    });

    it('integration is inactive', async () => {
      expect(result).toBeUndefined();
    });
  });
});

describe('createMessagingTranscript', () => {
  describe('Everything is successful', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      result = await createMessagingTranscript({
        logContext,
        cxAuth: 'auth',
      });
    });

    it('finish successfully', async () => {
      expect(result).toMatchSnapshot();
    });

    it('verify artifact call', async () => {
      expect(axios.mock.calls[1]).toEqual(expect.arrayContaining([
        {
          auth: 'auth',
          method: 'get',
          url: 'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/artifacts/mock-artifact-id',
        },
      ]));
    });
  });

  describe('Transcript exists', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
    });

    it('transcript object as true', async () => {
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          artifactId: '5e31c81640a22c000f5d7f70',
        },
      }));
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          artifactId: '5e31c81640a22c000f5d7f70',
          files: [{
            metadata: {
              transcript: true,
            },
          }],
        },
      }));
      const result = await createMessagingTranscript({
        logContext,
        cxAuth: 'auth',
      });
      expect(result).toMatchSnapshot();
    });
  });

  describe('gets error', () => {
    it('during transcript retrival', async () => {
      jest.clearAllMocks();
      axios.mockImplementationOnce(() => ({
        data: {
          appId: '5e31c81640a22c000f5d7f28',
          artifactId: '5e31c81640a22c000f5d7f70',
        },
      }));
      axios.mockRejectedValueOnce();
      try {
        await createMessagingTranscript({
          logContext,
          cxAuth: 'auth',
        });
      } catch (error) {
        expect(Promise.reject(new Error('Error retrieving artifact'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });
});

describe('sendEndingInteractionNotification', () => {
  let result;
  beforeAll(async () => {
    jest.clearAllMocks();
    result = await sendEndingInteractionNotification({ logContext });
  });

  it('finish successfully', async () => {
    expect(result).toEqual('sendEndingInteractionNotification');
  });

  it('successfully sent notification', async () => {
    expect(mockSendMessage.mock.calls).toMatchSnapshot();
  });
});

describe('sendMessageToParticipants', () => {
  describe('Everything is successful', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
      await sendMessageToParticipants({ logContext });
    });

    it('calls correctly', async () => {
      expect(mockSendMessage.mock.calls).toMatchSnapshot();
    });
  });

  describe('Error during call', () => {
    beforeAll(async () => {
      jest.clearAllMocks();
    });

    it('fail to send message to participants', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error());
      try {
        await sendMessageToParticipants({ logContext });
      } catch (err) {
        expect(Promise.reject(new Error('Failed to send messages to participants'))).rejects.toThrowErrorMatchingSnapshot();
      }
    });
  });
});

describe('getMetadata', () => {
  beforeAll(async () => {
    jest.clearAllMocks();
    await getMetadata({
      tenantId: '250faddb-9723-403a-9bd5-3ca710cb26e5',
      interactionId: '667802d8-2260-436c-958a-2ee0f71f73f0',
      smoochUserId: '7534c040-534d-11ea-8aa0-c32d6a748e46',
      auth: 'auth',
    });
  });

  it('calls successfully', async () => {
    expect(axios.mock.calls[0]).toMatchSnapshot();
  });

  it('verify get metadata call', async () => {
    expect(axios.mock.calls[0]).toEqual(expect.arrayContaining([
      {
        auth: 'auth',
        method: 'get',
        url: 'https://us-east-1-dev-edge.domain/v1/tenants/250faddb-9723-403a-9bd5-3ca710cb26e5/interactions/667802d8-2260-436c-958a-2ee0f71f73f0/metadata',
      },
    ]));
  });
});

describe('disconnectClient', () => {
  describe('disconnectClient - whatsapp', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      result = await disconnectClient({
        logContext: whatsappLogContext,
        cxAuth: 'auth',
      });
    });

    it('finish successfully', async () => {
      expect(result).toMatchSnapshot();
    });
  });

  describe('disconnectClient - non-whatsapp', () => {
    let result;
    beforeAll(async () => {
      jest.clearAllMocks();
      result = await disconnectClient({
        logContext,
        cxAuth: 'auth',
      });
    });

    it('finish successfully', async () => {
      expect(result).toMatchSnapshot();
    });
  });
});
