# PDF Viewer Application

This is a web application that allows users to view PDF files, make selections on them, and generate new PDF files from those selections.

## Project Structure

- `app.py`: FastAPI backend server.
- `requirements.txt`: Python dependencies for the backend.
- `frontend/`: React application for the user interface.

## Prerequisites

Before you begin, ensure you have the following installed:

-   **Node.js and npm:** For the frontend development. You can download them from [nodejs.org](https://nodejs.org/).
-   **Python 3.8+ and pip:** For the backend development. You can download Python from [python.org](https://www.python.org/).

## Setup and Running the Application

Follow these steps to set up and run the application:

### 1. Backend Setup

1.  Navigate to the `pdf_viewer_app` directory:
    ```bash
    cd pdf_viewer_app
    ```

2.  (Optional, but recommended) Create and activate a Python virtual environment:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  Install the Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```

### 2. Frontend Setup

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```

2.  Install the Node.js dependencies:
    ```bash
    npm install
    ```

3.  Build the frontend application for production:
    ```bash
    npm run build
    ```
    This will create a `build` folder inside the `frontend` directory.

4.  **Copy PDF.js Worker (Important!):** The `react-pdf` library requires a worker script to be available at the root of the static files.
    Navigate back to the `pdf_viewer_app` directory:
    ```bash
    cd ..
    ```
    Copy the worker script from `node_modules` to the `static` directory:
    ```bash
    cp frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs static/
    ```
    *Note: This is a manual step. For a more automated deployment, consider configuring your build process to copy this file automatically.*

5.  Move the built frontend assets to the `static` directory that the FastAPI server will serve:
    ```bash
    rm -rf static # Remove the old static directory if it exists
    mv frontend/build static
    ```

### 3. Running the Server

1.  Ensure you are in the `pdf_viewer_app` directory.
2.  Start the FastAPI server:
    ```bash
    uvicorn app:app --reload
    ```
    The `--reload` flag is useful for development as it restarts the server on code changes.

3.  Open your web browser and navigate to `http://127.0.0.1:8000` (or the address shown in your terminal) to access the application.
