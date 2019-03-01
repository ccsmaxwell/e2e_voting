# E-Voting (CUHK CSE FYP LYU1803)

## Install
requirement: Node.js and mongoDB
```bash
git clone https://github.com/ccsmaxwell/e2e_voting.git
cd e2e_voting
npm install
```

## Configuration
- Modify config/config.json (Note: if you want to run multiple instances on a machine, please **DO NOT share** the config file, make copies instead)
```java
{
  "port": "3001", //port number to listen
  "serverType": "public", //(reserved for future use)
  "serverPubKeyPath": "./key/key3001.pub",  //Path (absolute/relative) to the public key for this server instance
  "serverPriKeyPath": "./key/key3001.key",  //Path (absolute/relative) to the private key for this server instance
  "indexURL": "http://localhost:3001/", //URL to access to this instance
  "mongoDbPath": "mongodb://localhost:27017/any_database_name", //Path for connection to the mongoDB database

  "awsEmailEnable": true, //Enable/Disable sending email via AWS for this server
  "awsEmailFrom": "ccsmaxwell@link.cuhk.edu.hk",  //Email sender address (must be verified in AWS console before sending email)
  "awsAccessKeyId": "AKIAJPUVS2RHUAVXJKPQ", //Public access key for AWS API
  "awsSecretAccessKeyPath": "./key/aws-ses.secret", //Path to the private access key for AWS API
  "awsRegion": "us-west-2", //Region setting in AWS
  "awsProxy": "", //Proxy URL for AWS services

  // Following configuration must be the same across all servers, DO NOT change unless you are confident enough
  "blockTimerInterval": 15000,  //Interval between generating block (in ms)
  "blockTimerBuffer": 3000, //Time buffer between ballot submission and block generation (in ms)
  "pingInterval": 60000,  //Interval for each ping to other servers (in ms)
  "keyChangeWaitTime": 5000 //Voter/Trustee key change waiting time to generate a block for them
}
```
- Generate RSA key pair for server in PKCS#8 format (Note: please **DO NOT share** key files between different instance)
```bash
openssl genrsa -out config/key/key3001.pem 1024
openssl rsa -in config/key/key3001.pem -pubout -out config/key/key3001.pub
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in config/key/key3001.pem -out config/key/key3001.key
rm config/key/key3001.pem
```

## Start
```bash
node ./bin/www <PATH_TO_CONFIG_FILE>
```
- Set proxy environment variable if you need to
```bash
http_proxy="" node ./bin/www <PATH_TO_CONFIG_FILE>
```

## Files
- **/bin** server starting point
- **/config** configuration files
- **/controllers** backend code
- **/model** database model (schema)
- **/public** public static file, e.g. imagees, client-js, css
- **/routes** route URL to backend code and view files
- **/views** frontend html view

## Reference:
- Materialize: http://materializecss.com/
- Mongoose (for MongoDB in Node.js): http://mongoosejs.com/
- EJS (for view template): http://ejs.co/