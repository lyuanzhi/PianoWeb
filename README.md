# PianoWeb
A piano website created with Javascript.

## Demo
[https://lyuanzhi.github.io/PianoWeb](https://lyuanzhi.github.io/PianoWeb)

## Tech Stack
1. Javascript

## Dependencies
```
Node.js: 14.x
./package.json
```

## Node.js Run and Build
1. ```npm run serve```
2. ```npm run build```

## Deploy
Just follow the instructions in ```./.github/workflows```.

### Two Things To Note
1. You should give the workflow permission to create a new branch.
![](imgs/deploynote1.png)

2. You should add ```vue.config.js``` which configures the ```publicPath```.
```
module.exports = {
  publicPath: '/PianoWeb/'
}
```

## Demo Screenshots
![](imgs/deploynote1.png)
