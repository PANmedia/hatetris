<?php
$scores = [];
if (is_file('scores.json')) {
    $scores = file_get_contents('scores.json');
    $scores = json_decode($scores);
    if (!$scores) {
        $scores = [];
    }
}
$scores[] = $_POST;
file_put_contents('scores.json', json_encode($scores, JSON_PRETTY_PRINT));
echo json_encode(true);
