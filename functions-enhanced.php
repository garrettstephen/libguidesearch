<?php
// Enhanced WordPress REST API endpoints for AI Law Library Search
add_action('rest_api_init', function () {
  
  // Add CORS headers for all REST API requests
  add_filter('rest_pre_serve_request', function($served, $result, $request, $server) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
    header('Access-Control-Expose-Headers: X-Total-Count');
    return $served;
  }, 10, 4);

  register_rest_route('ais/v1', '/health', [
    'methods'  => 'GET',
    'permission_callback' => '__return_true',
    'callback' => function () {
      $start = microtime(true);
      $resp = wp_remote_get('http://128.187.43.25:8080/health', [
        'timeout' => 60,
        'redirection' => 0,
        'headers' => [
          'X-API-Key' => '80c7512f1c3d7252a74d00dcd7dfc62986a172e8e458a27a8c2284521c8b644e'
        ]
      ]);
      $elapsed = round((microtime(true) - $start) * 1000);

      if (is_wp_error($resp)) {
        return new WP_REST_Response([
          'ok' => false,
          'error' => $resp->get_error_message()
        ], 502);
      }

      $code = wp_remote_retrieve_response_code($resp);
      $body = wp_remote_retrieve_body($resp);
      $json = json_decode($body, true);
      
      return new WP_REST_Response($json ?? ['raw' => $body], $code);
    },
  ]);

  register_rest_route('ais/v1', '/search', [
    'methods'  => 'GET',
    'permission_callback' => '__return_true',
    'callback' => function (WP_REST_Request $req) {
      $query = $req->get_param('query');
      if (!$query) return new WP_Error('bad_request', 'Missing query', ['status' => 400]);
      $debug = $req->get_param('debug');
      $skip  = $req->get_param('skipWhitelist');

      $url = add_query_arg(array_filter([
        'query' => sanitize_text_field($query),
        'debug' => $debug,
        'skipWhitelist' => $skip,
      ]), 'http://128.187.43.25:8080/search');

      $start = microtime(true);
      $resp = wp_remote_get($url, [
        'timeout' => 60, 
        'redirection' => 0,
        'headers' => [
          'X-API-Key' => '80c7512f1c3d7252a74d00dcd7dfc62986a172e8e458a27a8c2284521c8b644e'
        ]
      ]);
      $elapsed = round((microtime(true) - $start) * 1000);

      if (is_wp_error($resp)) {
        return new WP_REST_Response([
          'ok' => false,
          'error' => $resp->get_error_message(),
          'requested_url' => $url
        ], 502);
      }

      $code = wp_remote_retrieve_response_code($resp);
      $body = wp_remote_retrieve_body($resp);
      $json = json_decode($body, true);
      
      return new WP_REST_Response($json ?? ['raw' => $body], $code);
    },
  ]);
});

// Handle OPTIONS requests for CORS preflight
add_action('init', function() {
  if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key');
    header('Access-Control-Max-Age: 86400');
    http_response_code(200);
    exit();
  }
});
?>