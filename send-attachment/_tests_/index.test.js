/* eslint-disable max-len */
const axios = require('axios');

jest.mock('axios');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5e31c81640a22c000f5d7f28-id': 'id',
        '5e31c81640a22c000f5d7f28-secret': 'secret',
      }),
    }),
  }))
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        username: 'username',
        password: 'paasword',
      }),
    }),
  }));

const mockAppend = jest.fn();
const mockGetHeaders = jest.fn();

axios.mockImplementation(() => ({
  data: {
    method: 'get',
    url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
    smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
    appId: '5e31c81640a22c000f5d7f28',
    userId: '5e31c81640a22c000f5d7f30',
    artifactId: '5e31c81640a22c000f5d7f35',
    latestMessageSentBy: 'agent',
  },
}));

const mockGetObject = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      Body: '',
    }),
  }));

const mockCreate = jest.fn()
  .mockImplementation(() => ({
    mediaUrl: 'media-url',
    mediaType: 'image/smooch.jpg',
  }));

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    message: {
      _id: '5e31c81640a22c000f5d7f20',
      text: 'messages',
      type: 'type',
      received: 50,
    },
  }));

const mockGetQueueUrl = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      QueueUrl: 'queue-url',
    }),
  }));

const mockSqsSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

// const mockGet = jest.fn()
//   .mockImplementation(() => ({
//     promise: () => ({
//       Item: {
//         'client-disconnect-minutes': 50,
//         LatestCustomerMessageTimestamp: '2020-02-18T20:47:50.670Z',
//         LatestAgentMessageTimestamp: '2020-02-18T20:47:38.670Z',
//       },
//     }),
//   }));

const mockFormData = jest.fn(() => ({
  append: mockAppend,
  getHeaders: mockGetHeaders,
}));

global.FormData = mockFormData;

const mockHeadObject = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      ContentLength: 50,
    }),
  }));

const mockSmoochCore = jest.fn(() => ({
  attachments: {
    create: mockCreate,
  },
  appUsers: {
    sendMessage: mockSendMessage,
  },
}));

jest.mock('aws-sdk', () => ({
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: mockGetQueueUrl,
    sendMessage: mockSqsSendMessage,
  })),
  // DynamoDB: {
  //   DocumentClient: jest.fn().mockImplementation(() => ({
  //     get: mockGet,
  //   })),
  // },
  S3: jest.fn().mockImplementation(() => ({
    getObject: mockGetObject,
    headObject: mockHeadObject,
  })),
}));

jest.mock('smooch-core', () => mockSmoochCore);

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    'interaction-id': '66d83870-30df-4a3b-8801-59edff162040',
  },
  'multipart-params': {
    mulripart: {
      'content-type': 'content-type',
      'aws-bucket': 'aws-Bucket',
      'aws-key': 'aws-Key',
      filename: 'filename',
    },
    agentMessageId: '66d83870-30df-4a3b-8801-59edff162045',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
    'first-name': 'first-name',
    'last-name': 'last-name',
  },
};

const { handler } = require('../index');

describe('send-attachment', () => {
  describe('Everything is successful', () => {
    // it('sends back status 200 when the code runs without any error', async () => {
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when customer message timestamp is less than agent message timestamp', async () => {
    //   mockGet.mockImplementation(() => ({
    //     promise: () => ({
    //       Item: {
    //         'client-disconnect-minutes': 50,
    //         LatestCustomerMessageTimestamp: '2020-02-18T20:47:38.670Z',
    //         LatestAgentMessageTimestamp: '2020-02-18T20:47:48.670Z',
    //       },
    //     }),
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when customer message timestamp or agent message timestamp are not provided', async () => {
    //   mockGet.mockImplementation(() => ({
    //     promise: () => ({
    //       Item: {
    //         'client-disconnect-minutes': 50,
    //       },
    //     }),
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when Items are not provided', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: {
    //         'client-disconnect-minutes': 50,
    //       },
    //     }),
    //   }));
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: {
    //       },
    //     }),
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when no disconnect timeout is set', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: {
    //       },
    //     }),
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when there is a faliure sending reporting event', async () => {
    //   mockSqsSendMessage.mockImplementationOnce(() => ({
    //     promise: () => ({}),
    //   }));
    //   mockSqsSendMessage.mockImplementationOnce(() => ({
    //     promise: () => ({}),
    //   }));
    //   mockSqsSendMessage.mockRejectedValueOnce(new Error());
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when there is an error uploading file to artifact', async () => {
    //   axios.mockImplementationOnce(() => ({
    //     data: {
    //       method: 'get',
    //       url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
    //       smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
    //       appId: '5e31c81640a22c000f5d7f28',
    //       userId: '5e31c81640a22c000f5d7f30',
    //       artifactId: '5e31c81640a22c000f5d7f35',
    //       latestMessageSentBy: 'customer',
    //     },
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when the media Type is a file', async () => {
    //   mockCreate.mockImplementationOnce(() => ({
    //     mediaUrl: 'media-url',
    //     mediaType: 'smooch.jpg',
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when there is a error uploading file to artifact', async () => {
    //   mockGetQueueUrl.mockRejectedValueOnce(new Error());
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('when there is a error checking for dead interaction', async () => {
    //   const error = new Error();
    //   error.response = {
    //     status: 0,
    //   };
    //   axios.mockImplementationOnce(() => ({
    //     data: {
    //       method: 'get',
    //       url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
    //       smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
    //       appId: '5e31c81640a22c000f5d7f28',
    //       userId: '5e31c81640a22c000f5d7f30',
    //       artifactId: '5e31c81640a22c000f5d7f35',
    //       latestMessageSentBy: 'customer',
    //     },
    //   }));
    //   axios.mockRejectedValueOnce(error);
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    // it('When no register in table is found for client disconnect minutes checker', async () => {
    //   mockGet.mockImplementationOnce(() => ({
    //     promise: () => ({
    //       Item: null,
    //     }),
    //   }));
    //   const result = await handler(event);
    //   expect(result).toMatchSnapshot();
    // });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        axios.mockImplementation(() => ({
          data: {
            method: 'get',
            url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
            smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
            appId: '5e31c81640a22c000f5d7f28',
            userId: '5e31c81640a22c000f5d7f30',
            artifactId: '5e31c81640a22c000f5d7f35',
            latestMessageSentBy: 'customer',
          },
        }));
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              '5e31c81640a22c000f5d7f28-id': 'id',
              '5e31c81640a22c000f5d7f28-secret': 'secret',
            }),
          }),
        }));
        mockGetSecretValue.mockImplementationOnce(() => ({
          promise: () => ({
            SecretString: JSON.stringify({
              username: 'username',
              password: 'paasword',
            }),
          }),
        }));
        await handler(event);
      });
      // it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
      //   expect(mockGetSecretValue.mock.calls[0]).toEqual(expect.arrayContaining([{
      //     SecretId: 'us-east-1-dev-smooch-app',
      //   }]));
      // });

      // it('passes in the correct arguments to secretClient.getSecretValue() to get cx credentials', async () => {
      //   expect(mockGetSecretValue.mock.calls[1]).toEqual(expect.arrayContaining([{
      //     SecretId: 'us-east-1-dev-smooch-cx',
      //   }]));
      // });

      // it('passes in the correct arguments to axios to get interaction metadta', async () => {
      //   expect(axios.mock.calls[0]).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to SmoochCore', async () => {
      //   expect(mockSmoochCore.mock.calls).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to s3.headObject()', async () => {
      //   expect(mockHeadObject.mock.calls).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to s3.getObject() in retrieveObject()', async () => {
      //   expect(mockGetObject.mock.calls).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to smooch.attachments.create()', async () => {
      //   expect(mockCreate.mock.calls).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to smooch.appUsers.sendMessage()', async () => {
      //   expect(mockSendMessage.mock.calls).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to sqs.getQueueUrl() in uploadArtifactFile()', async () => {
      //   expect(mockGetQueueUrl.mock.calls[0]).toEqual(expect.arrayContaining([{
      //     QueueName: 'us-east-1-dev-upload-artifact-file',
      //   }]));
      // });

      // it('passes in the correct arguments to sqs.sendMessage() in uploadArtifactFile()', async () => {
      //   expect(mockSqsSendMessage.mock.calls[0]).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to docClient.get() in getClientInactivityTimeout()', async () => {
      //   expect(mockGet.mock.calls[0]).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to docClient.get() in shouldCheckIfClientIsDisconnected()', async () => {
      //   expect(mockGet.mock.calls[1]).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to sqs.getQueueUrl() in checkIfClientIsDisconnected()', async () => {
      //   expect(mockGetQueueUrl.mock.calls[1]).toEqual(expect.arrayContaining([{
      //     QueueName: 'us-east-1-dev-smooch-client-disconnect-checker',
      //   }]));
      // });

      // it('passes in the correct arguments to sqs.sendMessage() in checkIfClientIsDisconnected()', async () => {
      //   expect(mockSqsSendMessage.mock.calls[1]).toMatchSnapshot();
      // });

      // it('passes in the correct arguments to sqs.getQueueUrl() in updateInteractionMetadata()', async () => {
      //   expect(mockGetQueueUrl.mock.calls[2]).toEqual(expect.arrayContaining([{
      //     QueueName: 'us-east-1-dev-update-interaction-metadata',
      //   }]));
      // });

      // it('passes in the correct arguments to sqs.getQueueUrl() in sendReportingEvent()', async () => {
      //   expect(mockGetQueueUrl.mock.calls[3]).toEqual(expect.arrayContaining([{
      //     QueueName: 'us-east-1-dev-send-reporting-event',
      //   }]));
      // });

      // it('passes in the correct arguments to sqs.sendMessage() in sendReportingEvent()', async () => {
      //   expect(mockSqsSendMessage.mock.calls[2]).toMatchSnapshot();
      // });
    });
  });

  it('sends back ststus 500 when there is an error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving cx credentials', async () => {
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({
        SecretString: JSON.stringify({
          '5e31c81640a22c000f5d7c55-id': 'id',
          '5e31c81640a22c000f5d7c55-secert': 'secret',
        }),
      }),
    }));
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving the interaction metadata', async () => {
    axios.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials (error by SmoochCore)', async () => {
    mockSmoochCore.mockImplementationOnce(() => {
      throw new Error('SmoochCore');
    });
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 413 error when the file is too large', async () => {
    mockHeadObject.mockImplementationOnce(() => ({
      promise: () => ({
        ContentLength: 26214403,
      }),
    }));
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving file from S3 (thrown by retrieveObject())', async () => {
    mockGetObject.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error retrieving file from S3 (thrown by generateFormDataFromStream())', async () => {
    mockFormData.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error sending file to customer', async () => {
    mockCreate.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when the file is too large', async () => {
    const error = {
      response: {
        statusText: 'status-text',
        status: 413,
      },
    };
    mockCreate.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it("sends back status 500 with an error 'status-text'", async () => {
    const error = {
      response: {
        statusText: 'status-text',
        status: 410,
      },
    };
    mockCreate.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is an error sending messages', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 500 when there is a problem sending message', async () => {
    const error = {
      response: {
        statusText: 'Could not send file to customer',
      },
    };
    mockSendMessage.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  it('sends back status 410 when sending message to dead interaction', async () => {
    const error = new Error();
    error.response = {
      status: 404,
    };
    axios.mockImplementationOnce(() => ({
      data: {
        method: 'get',
        url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
        smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
        appId: '5e31c81640a22c000f5d7f28',
        userId: '5e31c81640a22c000f5d7f30',
        artifactId: '5e31c81640a22c000f5d7f35',
        latestMessageSentBy: 'customer',
      },
    }));
    axios.mockRejectedValueOnce(error);
    const result = await handler(event);
    expect(result).toMatchSnapshot();
  });

  // it('throws an error when there is a problem getting smooch interaction record (thrown by getClientInactivityTimeout())', async () => {
  //   try {
  //     mockGet.mockRejectedValueOnce(new Error());
  //     await handler(event);
  //   } catch (error) {
  //     expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
  //   }
  // });

  // it('throws an error when there is a problem getting smooch interaction record (thrown by shouldCheckIfClientIsDisconnected() )', async () => {
  //   try {
  //     mockGet.mockImplementationOnce(() => ({
  //       promise: () => ({
  //         Item: {
  //           'client-disconnect-minutes': 50,
  //           LatestCustomerMessageTimestamp: '2020-02-18T20:47:38.700Z',
  //           LatestAgentMessageTimestamp: '2020-02-18T20:47:38.670Z',
  //         },
  //       }),
  //     }));
  //     mockGet.mockRejectedValueOnce(new Error());
  //     await handler(event);
  //   } catch (error) {
  //     expect(Promise.reject(new Error('Failed to get smooch interaction record'))).rejects.toThrowErrorMatchingSnapshot();
  //   }
  // });

  // it('throws an error when there is an error updating latestMessageSentBy flag from metadata', async () => {
  //   try {
  //     axios.mockImplementationOnce(() => ({
  //       data: {
  //         method: 'get',
  //         url: 'https://us-east-1-dev-edge.domain/v1/tenants/66d83870-30df-4a3b-8801-59edff162034/interactions/66d83870-30df-4a3b-8801-59edff162040/metadata',
  //         smoochIntegrationId: '66d83870-30df-4a3b-8801-59edff162050',
  //         appId: '5e31c81640a22c000f5d7f28',
  //         userId: '5e31c81640a22c000f5d7f30',
  //         artifactId: '5e31c81640a22c000f5d7f35',
  //         latestMessageSentBy: 'customer',
  //       },
  //     }));
  //     mockGetQueueUrl.mockImplementationOnce(() => ({
  //       promise: () => ({
  //         QueueUrl: 'queue-url',
  //       }),
  //     }));
  //     mockGetQueueUrl.mockImplementationOnce(() => ({
  //       promise: () => ({
  //         QueueUrl: 'queue-url',
  //       }),
  //     }));
  //     mockGetQueueUrl.mockRejectedValueOnce(new Error());
  //     await handler(event);
  //   } catch (error) {
  //     expect(Promise.reject(new Error('Error updating latestMessageSentBy flag from metadata'))).rejects.toThrowErrorMatchingSnapshot();
  //   }
  // });
});
