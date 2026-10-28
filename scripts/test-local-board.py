"""Acceptance test against a running local app. Creates and removes its own fixtures."""
import json
import sys
import urllib.error
import urllib.request
import uuid

base = sys.argv[1].rstrip('/')
created = []


def request(method, path, payload=None, expected=200, origin=None):
    headers = {'Content-Type': 'application/json'}
    if origin:
        headers['Origin'] = origin
    req = urllib.request.Request(base + '/api/local-boards' + path,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    body = response.read()
    assert response.status == expected, (method, path, response.status, body[:300])
    if expected == 200:
        assert 'application/json' in response.headers.get('Content-Type', ''), 'Local board API is missing (received the frontend fallback)'
        result = json.loads(body)
        assert result['success'], result
        return result['data']


try:
    boards = request('GET', '')
    assert isinstance(boards, list)
    request('POST', '', {'name': ' '}, 400)
    request('POST', '', {'name': 'x' * 201}, 400)
    for name in ('Acceptance A', 'Acceptance B'):
        board = request('POST', '', {'name': name})
        created.append(board['id'])
    first, second = created
    renamed = request('PUT', '/' + first, {'name': ' Renamed local project '})
    assert renamed['name'] == 'Renamed local project'
    task = request('POST', '/' + first + '/tasks',
                   {'title': '<script>plain text</script>', 'description': 'Saved locally', 'status': 'todo'})
    task_path = '/' + first + '/tasks/' + task['id']
    request('POST', '/' + first + '/tasks', {'title': ' '}, 400)
    request('POST', '/' + first + '/tasks', {'title': 'x' * 501}, 400)
    request('POST', '/' + first + '/tasks', {'title': 'Bad status', 'status': 'unknown'}, 422)
    assert request('GET', '/' + second + '/tasks') == []
    request('PUT', '/' + second + '/tasks/' + task['id'],
            {'title': 'Wrong project', 'status': 'done'}, 404)
    request('DELETE', '/' + second + '/tasks/' + task['id'], expected=404)
    for status in ('inprogress', 'inreview', 'done', 'cancelled', 'todo'):
        updated = request('PUT', task_path, {'title': 'Updated', 'description': 'Persisted', 'status': status})
        assert updated['status'] == status
        assert request('GET', '/' + first + '/tasks')[0] == updated
    request('DELETE', task_path)
    assert request('GET', '/' + first + '/tasks') == []
    request('DELETE', task_path, expected=404)
    request('GET', '/' + str(uuid.uuid4()) + '/tasks', expected=404)
    request('GET', '/not-a-uuid/tasks', expected=400)
    request('POST', '', {'name': 'Cross-origin'}, expected=403, origin='https://example.invalid')
    request('POST', '/' + first + '/tasks', {'title': 'Cascade', 'status': 'todo'})
    request('DELETE', '/' + first)
    created.remove(first)
    request('GET', '/' + first + '/tasks', expected=404)
    assert all(b['id'] != first for b in request('GET', ''))
    print('PASS: unauthenticated CRUD, status persistence, validation, project isolation, origin protection, deletion')
finally:
    for board_id in created:
        request('DELETE', '/' + board_id)
