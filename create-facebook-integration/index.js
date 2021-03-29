const {
  lambda: { log },
} = require('alonzo');

exports.handler = async () => {
  const logContext = {};

  log.info('create-facebook-integration was called', { ...logContext });

  return {
    status: 200,
    body: {
      message: 'API create-facebook-integration called successfully',
    },
  };
};
