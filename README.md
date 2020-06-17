# smooch-lambdas
_Lambdas for Smooch_

## Use 'alonzo' to generate new lambdas
_On root directory smooch-lambdas/_
```
npm run alonzo -- --generate --name <lambda-name>
```

### Install dependencies
```
npm run alonzo -- --install <--clean-install>
npm run alonzo alonzo -- --install --lambda <lambda-name> <--clean-install>
```

### Generate zip file
```
npm run alonzo -- --zip
npm run alonzo -- --zip --lambda <lambda-name>
```
### Automatic Lambda Deployment
Lambdas will automatically deploy to dev after building, and to qe if it is a cut version.
If there is a non-lambda directory or a lambda you do not wish to have automatically deployed, add it to the list "blackListDirs" in the Jenkinsfile