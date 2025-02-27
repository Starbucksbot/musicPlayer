from flask import Flask, render_template, jsonify, send_from_directory, request
import os
import json
from youtube_search_python import YoutubeSearch
from subprocess import Popen, PIPE

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config.from_pyfile('config.py')

SEARCH_HISTORY_FILE = 'search_history.json'

# Load or initialize search history
def load_search_history():
    try:
        with open(SEARCH_HISTORY_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

# Save search history
def save_search_history(history):
    with open(SEARCH_HISTORY_FILE, 'w') as f:
        json.dump(history, f)

search_history = load_search_history()

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/search')
def search():
    query = request.args.get('q', '')
    if not query:
        return jsonify({'error': 'Query parameter is required'}), 400

    try:
        results = YoutubeSearch(query, max_results=5).to_dict()
        formatted_results = [{'title': r['title'], 'url': f"https://www.youtube.com/watch?v={r['id']}"}
                           for r in results]
        search_history.append({'query': query, 'title': formatted_results[0]['title'],
                             'url': formatted_results[0]['url'], 'timestamp': str(time.time())})
        if len(search_history) > 30:
            search_history.pop(0)
        save_search_history(search_history)
        return jsonify({'results': formatted_results})
    except Exception as e:
        return jsonify({'error': 'Search failed'}), 500

@app.route('/stream')
def stream():
    url = request.args.get('url', '')
    if not url or 'youtube.com' not in url:
        return 'Invalid video URL', 400

    try:
        process = Popen(['yt-dlp', url, '-f', 'bestaudio', '-o', '-'], stdout=PIPE, stderr=PIPE)
        return app.response_class(
            process.stdout,
            mimetype='audio/mpeg',
            headers={'Content-Disposition': 'attachment'}
        )
    except Exception as e:
        return 'Streaming failed', 500

@app.route('/recommend')
def recommend():
    last_search = search_history[-1] if search_history else None
    if not last_search or not last_search['url']:
        return jsonify({'url': None, 'title': None})

    try:
        process = Popen(['yt-dlp', last_search['url'], '--dump-json'], stdout=PIPE, stderr=PIPE)
        output, error = process.communicate()
        if process.returncode == 0:
            data = json.loads(output)
            related = data.get('related_videos', [])[0] if data.get('related_videos') else None
            return jsonify({
                'url': f"https://www.youtube.com/watch?v={related['id']}" if related else None,
                'title': related['title'] if related else None
            })
        return jsonify({'url': None, 'title': None})
    except Exception as e:
        return jsonify({'url': None, 'title': None})

@app.route('/recent')
def recent():
    recent = search_history[-5:][::-1]  # Last 5, reversed for chronological order
    return jsonify(recent)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=app.config['PORT'])