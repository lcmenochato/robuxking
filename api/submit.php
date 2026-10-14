<?php
/**
 * ROI CLONE — Backend de Captura de Leads e Formulários
 * Funciona nativamente em cPanel, Hostgator, Locaweb, VPS e Servidores Apache/Nginx com PHP.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = $_POST;
    if (empty($data)) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?: [];
    }

    $lead = [
        'data_hora' => date('Y-m-d H:i:s'),
        'ip'        => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
        'origem'    => $_SERVER['HTTP_REFERER'] ?? 'Direto',
        'campos'    => $data,
    ];

    // 1. Salva o Lead em arquivo JSON estruturado
    $leadsFile = __DIR__ . '/leads.json';
    $existing = file_exists($leadsFile) ? json_decode(file_get_contents($leadsFile), true) : [];
    if (!is_array($existing)) $existing = [];
    $existing[] = $lead;
    file_put_contents($leadsFile, json_encode($existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    // 2. Salva o Lead em arquivo CSV (compatível com Excel / Google Sheets)
    $csvFile = __DIR__ . '/leads.csv';
    $csvExists = file_exists($csvFile);
    $fp = fopen($csvFile, 'a');
    if (!$csvExists) {
        fputcsv($fp, ['Data e Hora', 'IP', 'Dados Recebidos']);
    }
    fputcsv($fp, [date('d/m/Y H:i:s'), $lead['ip'], json_encode($data, JSON_UNESCAPED_UNICODE)]);
    fclose($fp);

    // Retorna resposta de sucesso
    echo json_encode([
        'success' => true,
        'message' => 'Lead e formulário processados com sucesso pelo backend ROI Clone!',
        'total_registrado' => count($existing),
    ]);
    exit;
}

echo json_encode([
    'status' => 'online',
    'service' => 'ROI Clone Backend Endpoint',
    'info' => 'Envie dados via POST para salvar formulários ou leads.'
]);
