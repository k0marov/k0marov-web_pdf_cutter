from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import HTMLResponse

app = FastAPI()

# Mount the entire 'static' directory to serve all static files, including index.html
app.mount("/", StaticFiles(directory="static", html=True), name="static")