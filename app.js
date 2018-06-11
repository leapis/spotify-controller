var express = require('express'); 
var request = require('request'); 
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var url = require('url');
var fs = require('fs');
var CREDS = require('./creds');

var client_id = CREDS.CLIENT_ID;
var client_secret = CREDS.CLIENT_SECRET;
var redirect_uri = 'http://localhost:8888/callback/';
var global_access_token = "";
var global_refresh_token = "";

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  //request full permissions
  var scope = 'user-read-private user-library-read user-library-modify playlist-modify-public user-read-recently-played user-read-private user-read-email playlist-modify-private streaming user-top-read playlist-read-collaborative user-modify-playback-state user-follow-modify user-read-currently-playing user-read-playback-state user-follow-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {
  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
          querystring.stringify({
            access_token: global_access_token,
            refresh_token: global_refresh_token
          }));
    
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
    
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;
            console.log("token: " + access_token);
        fs.writeFile('refresh_token.txt', refresh_token, 'utf8');
        if (access_token != null && refresh_token != null){
          global_access_token = access_token;
          global_refresh_token = refresh_token;
          fs.writeFile('refresh_token.txt', refresh_token, 'utf8');
        }
        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {
  res.sendStatus(refresh());
});

app.get('/api', function(req, res) {
  var url = req.query.url;
  var type = req.query.reqType;
  fetch(url, res, type);
});

app.get('/request', function(req, res) {
  var action = req.query.action;
  switch (action){
    case 'next_song':
      fetch('https://api.spotify.com/v1/me/player/next', res, 'POST');
      break;
    case 'previous_song':
      fetch('https://api.spotify.com/v1/me/player/previous', res, 'POST');
      break;
    case 'repeat_track':
      fetch('https://api.spotify.com/v1/me/player/repeat?state=track', res, 'PUT');
      break;
    case 'repeat_context':
      fetch('https://api.spotify.com/v1/me/player/repeat?state=context', res, 'PUT');
      break;
    case 'repeat_off':
      fetch('https://api.spotify.com/v1/me/player/repeat?state=off', res, 'PUT');
      break;
    case 'set_volume':
      fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${req.query.volume_percent}`, res, 'PUT');
      break;
    case 'save_track':
      fetch(`https://api.spotify.com/v1/me/tracks?ids=${req.query.id}`, res, 'PUT');
      break;
    case 'get_current_track':
      /*return*/fetch('https://api.spotify.com/v1/me/player/currently-playing', res, 'GET'); //TODO: set up handling returns
      break;
    case 'save_current_track':
      saveCurrentTrack(fetch,fetch,res);
      //fetch(`https://api.spotify.com/v1/me/tracks?ids=${newID}`, res, 'PUT');
      break;
    case 'error':
      break;
  }
});

function fetch(url, res, type){
  if(global_refresh_token == ""){
    console.log("Please Log In at localhost:8888");
    res.sendStatus(409);
    return;
  }
  var options = {
    url: url,
    headers: { 'Authorization': 'Bearer ' + global_access_token },
    json: true
  };
  switch (type){
    case 'GET':
      request.get(options, function(error, response, body) {
        if (!error && response.statusCode === 204) {
          res.sendStatus(response.statusCode);
          console.log("Request: "+ url + ", Status: " + response.statusCode);
        }
        else if (!error){
          res.sendStatus(response.statusCode);
          if (response.statusCode === 204){
              return;
            }
            else{
              console.log(response);
              return response;
          }
        }
        else{
          console.log("Error");
          if (response){
            res.send(response.statusCode);
          }
          else{
            res.sendStatus(502); 
          }
        }
      });
      break;
    case 'POST':
      request.post(options, function(error, response, body) {
        if (!error && response.statusCode === 204) {
          res.sendStatus(response.statusCode);
          console.log("Request: "+ url + ", Status: " + response.statusCode);
        }
        else if (!error){
          res.sendStatus(response.statusCode);
          if (response.statusCode === 204){
              return;
            }
            else{
              console.log(response);
              return response;
          }
        }
        else{
          console.log("Error");
          if (response){
            res.send(response.statusCode);
          }
          else{
            res.sendStatus(502); 
          }
        }
      });
      break;
    case 'PUT':
      request.put(options, function(error, response, body) {
        if (!error && response.statusCode === 204) {
          res.sendStatus(response.statusCode);
          console.log("Request: "+ url + ", Status: " + response.statusCode);
        }
        else if (!error){
          res.sendStatus(response.statusCode);
          if (response.statusCode === 204){
              return;
            }
            else{
              console.log(response.statusMessage);
              return response;
          }
        }
        else{
          console.log("error");
          if (response){
            res.send(response.statusCode);
          }
          else{
            res.sendStatus(502); 
          }
        }
      });
      break;
  }
}

function refresh(){
  var refresh_token = global_refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      global_access_token = access_token;
      console.log("ACCESS_TOKEN updated: " + global_access_token);
      return 204;
    }
    else{
      console.log("Error: refresh_token.txt potentially corrupted, please delete file and restart program");
      return 409;
    }
  });
}

async function saveCurrentTrack(f1, f2,res){
  var id = await f1('https://api.spotify.com/v1/me/player/currently-playing', res, 'GET');
  await console.log(id);
}


function readRefreshToken(){
  const PATH = './refresh_token.txt';
    if (fs.existsSync(PATH)){
        fs.readFile(PATH, 'utf8', function(err, data) {
      if (err) throw err;
      global_refresh_token = data;
      refresh();
    });
  }
  else{
    console.log("Please Log In at localhost:8888");
  }
}

app.listen(8888);
readRefreshToken();
setInterval(refresh, 3500000); //update every ~58 min (Spotify access tokens expire after one hour)
