#!groovy​
@Library('sprockets') _

def deployLambdas = {
    def l = new lambda()
    def buildTool = new node()
    String[] blacklist = ["utils"]
    l.deployLambdas(blacklist, buildTool)
}

node () {
    nodeCore.defaultPipeline(postBuild: deployLambdas)
}