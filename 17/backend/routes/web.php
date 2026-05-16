<?php

$router->get('/', function () use ($router) {
    return response()->json([
        'message' => 'URL Shortener API',
        'version' => '1.0.0'
    ]);
});

$router->get('/{shortCode}', 'ShortLinkController@redirect');

$router->group(['prefix' => 'api'], function () use ($router) {
    
    $router->post('/auth/register', 'AuthController@register');
    $router->post('/auth/login', 'AuthController@login');
    $router->post('/auth/refresh', 'AuthController@refresh');
    
    $router->post('/links/public', 'ShortLinkController@createPublic');
    
    $router->group(['middleware' => ['jwt.auth']], function () use ($router) {
        $router->post('/auth/me', 'AuthController@me');
        $router->post('/auth/logout', 'AuthController@logout');
        
        $router->get('/links', 'ShortLinkController@index');
        $router->post('/links', 'ShortLinkController@store');
        $router->get('/links/{id}', 'ShortLinkController@show');
        $router->put('/links/{id}', 'ShortLinkController@update');
        $router->delete('/links/{id}', 'ShortLinkController@destroy');
        $router->post('/links/{id}/toggle', 'ShortLinkController@toggle');
        $router->get('/links/{id}/stats', 'ShortLinkController@stats');
        $router->get('/links/{id}/qrcode', 'ShortLinkController@qrcode');
        
        $router->get('/stats/overview', 'StatsController@overview');
        $router->get('/stats/trends', 'StatsController@trends');
        $router->get('/stats/referrers', 'StatsController@referrers');
        
        $router->get('/api-keys', 'ApiKeyController@index');
        $router->post('/api-keys', 'ApiKeyController@store');
        $router->delete('/api-keys/{id}', 'ApiKeyController@destroy');
    });
    
    $router->group(['middleware' => ['jwt.auth', 'admin']], function () use ($router) {
        $router->get('/users', 'UserController@index');
        $router->post('/users', 'UserController@store');
        $router->get('/users/{id}', 'UserController@show');
        $router->put('/users/{id}', 'UserController@update');
        $router->delete('/users/{id}', 'UserController@destroy');
    });
});
