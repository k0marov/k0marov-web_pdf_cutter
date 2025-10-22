import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { jsPDF } from 'jspdf';
import './App.css';

pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

function App() {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfFile, setPdfFile] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null); // Temporary selection being drawn
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const pageRef = useRef(null);

  const [pageSelections, setPageSelections] = useState({}); // { pageNumber: [{id, left, top, width, height, displayedWidth, displayedHeight}] }
  const [nextSelectionId, setNextSelectionId] = useState(0);
  const [allPageDimensions, setAllPageDimensions] = useState({}); // { pageNumber: { width, height } }
  const [renderedCanvasDimensions, setRenderedCanvasDimensions] = useState({}); // { pageNumber: { width, height } }
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [constrainAspectRatio, setConstrainAspectRatio] = useState(false);
  // State for dragging selections
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [draggedSelectionId, setDraggedSelectionId] = useState(null);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 }); // Offset from mouse to selection's top-left

  useEffect(() => {
    setSelectionRect(null);
  }, [pageNumber]);

  const onDocumentLoadSuccess = useCallback(({ numPages: newNumPages }) => {
    setNumPages(newNumPages);
    setPageNumber(1);
    setPageSelections({});
    setAllPageDimensions({}); // Clear dimensions for new PDF
    setRenderedCanvasDimensions({}); // Clear rendered canvas dimensions
    console.log("onDocumentLoadSuccess: selections cleared."); // Fixed ESLint warning
  }, []); // Empty dependency array is now correct

  const onPageRenderSuccess = useCallback((page, canvas) => {
    // Store the original PDF page dimensions
    setAllPageDimensions(prev => ({
      ...prev,
      [page.pageNumber]: { width: page.originalWidth, height: page.originalHeight },
    }));

    // Store the actual pixel dimensions of the rendered canvas
    if (canvas) {
      console.log(`onPageRenderSuccess for page ${page.pageNumber}: canvas.width=${canvas.width}, canvas.height=${canvas.height}`);
      setRenderedCanvasDimensions(prev => ({
        ...prev,
        [page.pageNumber]: { width: canvas.width, height: canvas.height },
      }));
    }
  }, []); // Empty dependency array is now correct

  const handleFileChange = (event) => {
    setPdfFile(event.target.files[0]);
  };

  const handleMouseDown = (e) => {
    // Check if clicking on a delete button or an existing selection to drag
    if (e.target.className.includes('delete-selection-button')) {
      return;
    }

    if (e.target.className.includes('saved-selection')) {
      const selectionId = parseInt(e.target.dataset.selectionId);
      const selection = pageSelections[pageNumber].find(sel => sel.id === selectionId);
      if (selection) {
        setIsDraggingSelection(true);
        setDraggedSelectionId(selectionId);
        const { left, top } = e.target.getBoundingClientRect();
        setDragStartOffset({ x: e.clientX - left, y: e.clientY - top });
        e.stopPropagation(); // Prevent starting a new selection
      }
      return;
    }

    // Start new selection
    if (pageRef.current) {
      const { left, top, width, height } = pageRef.current.getBoundingClientRect();
      const startX = Math.max(0, Math.min(e.clientX - left, width));
      const startY = Math.max(0, Math.min(e.clientY - top, height));
      setStartPoint({ x: startX, y: startY });
      setIsSelecting(true);
      setSelectionRect(null);
    }
  };

  const handleMouseMove = (e) => {
    if (isDraggingSelection && draggedSelectionId !== null) {
      if (!pageRef.current) return;

      const pageRect = pageRef.current.getBoundingClientRect();
      const newLeft = e.clientX - pageRect.left - dragStartOffset.x;
      const newTop = e.clientY - pageRect.top - dragStartOffset.y;

      setPageSelections(prevSelections => {
        const currentPageSelections = [...(prevSelections[pageNumber] || [])];
        const updatedSelections = currentPageSelections.map(sel => {
          if (sel.id === draggedSelectionId) {
            // Boundary checks for dragging
            const boundedLeft = Math.max(0, Math.min(newLeft, pageRect.width - sel.width));
            const boundedTop = Math.max(0, Math.min(newTop, pageRect.height - sel.height));
            return { ...sel, left: boundedLeft, top: boundedTop };
          }
          return sel;
        });
        return { ...prevSelections, [pageNumber]: updatedSelections };
      });
      return;
    }

    if (!isSelecting || !pageRef.current) return;

    const pageRect = pageRef.current.getBoundingClientRect();
    // No need for effectiveLeft, effectiveTop, effectiveWidth, effectiveHeight here for visual feedback
    // as the selectionRect will be clamped in handleMouseUp for saving.

    // Calculate raw mouse position relative to the pageRef.current element
    const rawCurrentX = e.clientX - pageRect.left;
    const rawCurrentY = e.clientY - pageRect.top;

    // Determine the corners of the selection rectangle based on startPoint and rawCurrentX/Y
    const x1 = Math.min(startPoint.x, rawCurrentX);
    const y1 = Math.min(startPoint.y, rawCurrentY);
    let x2 = Math.max(startPoint.x, rawCurrentX);
    let y2 = Math.max(startPoint.y, rawCurrentY);

    if (constrainAspectRatio) {
      let currentWidth = x2 - x1;
      let currentHeight = y2 - y1;

      if (currentWidth === 0 || currentHeight === 0) {
        // Avoid division by zero or infinite loops if selection is a line or point
        // Do nothing or handle as appropriate, e.g., set a minimum size
      } else {
        const targetAspectRatio = 16 / 9;
        const currentAspectRatio = currentWidth / currentHeight;

        if (currentAspectRatio > targetAspectRatio) {
          // Current selection is wider than 16:9, so adjust width to match height
          currentWidth = currentHeight * targetAspectRatio;
          x2 = x1 + currentWidth;
        } else {
          // Current selection is taller than 16:9, so adjust height to match width
          currentHeight = currentWidth / targetAspectRatio;
          y2 = y1 + currentHeight;
        }
      }
    }

    setSelectionRect({
      left: x1,
      top: y1,
      width: x2 - x1,
      height: y2 - y1,
    });
  };

  const handleMouseUp = () => {
    if (isDraggingSelection) {
      setIsDraggingSelection(false);
      setDraggedSelectionId(null);
      setDragStartOffset({ x: 0, y: 0 });
      return;
    }

    setIsSelecting(false);
    if (selectionRect && selectionRect.width > 5 && selectionRect.height > 5) {
      const pageCanvas = pageRef.current; // This should be the canvas element
      const pageRect = pageCanvas.getBoundingClientRect(); // This gives CSS pixels

      // Ensure final selection is within bounds
      const finalLeft = Math.max(0, selectionRect.left);
      const finalTop = Math.max(0, selectionRect.top);
      const finalWidth = Math.min(selectionRect.width, pageRect.width - finalLeft);
      const finalHeight = Math.min(selectionRect.height, pageRect.height - finalTop);

      const newSelection = {
        left: finalLeft,
        top: finalTop,
        width: finalWidth,
        height: finalHeight,
        id: nextSelectionId,
        // Use the stored rendered canvas dimensions for the current page, with fallback to CSS pixels
        displayedWidth: renderedCanvasDimensions[pageNumber]?.width || pageRect.width,
        displayedHeight: renderedCanvasDimensions[pageNumber]?.height || pageRect.height,
      };
      setNextSelectionId(prevId => prevId + 1);

      setPageSelections(prevSelections => ({
        ...prevSelections,
        [pageNumber]: [...(prevSelections[pageNumber] || []), newSelection],
      }));
      setSelectionRect(null);
    } else {
      setSelectionRect(null);
    }
  };

  const deleteSelection = (idToDelete) => {
    setPageSelections(prevSelections => ({
      ...prevSelections,
      [pageNumber]: prevSelections[pageNumber].filter(sel => sel.id !== idToDelete),
    }));
  };

  const generatePdfFromSelections = async () => {
    setIsGeneratingPdf(true); // Set loading state to true
    console.log("Generate PDF button clicked.");
    console.log("Current pageSelections before generation:", pageSelections);

    if (!pdfFile) {
      alert("Please load a PDF first.");
      setIsGeneratingPdf(false); // Reset loading state if no PDF
      return;
    }

    // Initialize jsPDF with units in pixels
    const doc = new jsPDF({
      unit: 'px',
      format: 'a4' // Initial format, will be overridden per image
    });
    let firstImageAdded = false;

    try {
      console.log("Attempting to get PDF document object using pdfjs.getDocument.");

      const getPdfArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
          reader.readAsArrayBuffer(file);
        });
      };

      const arrayBuffer = await getPdfArrayBuffer(pdfFile);
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      console.log("PDF document object obtained.", pdf);

      const renderScale = 2; // Increase scale for higher quality

      for (let i = 1; i <= numPages; i++) {
        if (pageSelections[i] && pageSelections[i].length > 0) {
          console.log(`Processing page ${i} with selections.`);
          const page = await pdf.getPage(i);
          const originalPageWidth = allPageDimensions[i]?.width || page.originalWidth;
          const originalPageHeight = allPageDimensions[i]?.height || page.originalPageHeight;

          const viewport = page.getViewport({ scale: renderScale }); // Render at higher scale
          const tempCanvas = document.createElement('canvas');
          const tempContext = tempCanvas.getContext('2d');
          tempCanvas.width = viewport.width;
          tempCanvas.height = viewport.height;

          console.log(`Rendering page ${i} to off-screen canvas.`);
          await page.render({ canvasContext: tempContext, viewport: viewport }).promise;
          console.log(`Page ${i} rendered to off-screen canvas.`);

          const sortedSelections = [...pageSelections[i]].sort((a, b) => a.left - b.left);

          for (const sel of sortedSelections) {
            console.log(`--- Selection (page ${i}, id ${sel.id}) ---`);
            console.log(`  sel.left: ${sel.left}, sel.top: ${sel.top}, sel.width: ${sel.width}, sel.height: ${sel.height}`);
            console.log(`  sel.displayedWidth: ${sel.displayedWidth}, sel.displayedHeight: ${sel.displayedHeight}`);
            console.log(`  originalPageWidth: ${originalPageWidth}, originalPageHeight: ${originalPageHeight}`);
            console.log(`  tempCanvas.width: ${tempCanvas.width}, tempCanvas.height: ${tempCanvas.height}`);

            // Calculate scaling factor from displayed canvas to off-screen rendered canvas
            // This is crucial for accurate coordinate mapping
            const scaleFactor = (tempCanvas.width / sel.displayedWidth);

            console.log(`  scaleFactor: ${scaleFactor}`);

            // Calculate expected displayed height if aspect ratio was perfectly maintained
            const expectedDisplayedHeight = sel.displayedWidth * (originalPageHeight / originalPageWidth);
            // Calculate vertical padding introduced by react-pdf if actual displayed height is larger
            // This padding is assumed to be at the top and bottom, centering the content.
            const verticalPadding = Math.max(0, (sel.displayedHeight - expectedDisplayedHeight) / 2);

            // Adjust selection coordinates and dimensions based on the scale factors
            // The y-coordinate is adjusted to account for potential vertical padding/centering by react-pdf.
            const x_on_tempCanvas = sel.left * scaleFactor;
            const y_on_tempCanvas = (sel.top - verticalPadding) * scaleFactor;
            const width_on_tempCanvas = sel.width * scaleFactor;
            const height_on_tempCanvas = sel.height * scaleFactor;

            console.log(`  x_on_tempCanvas: ${x_on_tempCanvas}, y_on_tempCanvas: ${y_on_tempCanvas}, w_on_tempCanvas: ${width_on_tempCanvas}, h_on_tempCanvas: ${height_on_tempCanvas}`);

            // Check for valid dimensions before creating canvas
            if (width_on_tempCanvas <= 0 || height_on_tempCanvas <= 0) {
              console.warn(`Skipping selection ${sel.id} due to invalid dimensions: w=${width_on_tempCanvas}, h=${height_on_tempCanvas}`);
              continue; // Skip this selection
            }

            const selectionCanvas = document.createElement('canvas');
            selectionCanvas.width = width_on_tempCanvas;
            selectionCanvas.height = height_on_tempCanvas;
            const selectionCtx = selectionCanvas.getContext('2d');

            selectionCtx.drawImage(
              tempCanvas,
              x_on_tempCanvas, y_on_tempCanvas, width_on_tempCanvas, height_on_tempCanvas,
              0, 0, width_on_tempCanvas, height_on_tempCanvas
            );

            const imgData = selectionCanvas.toDataURL('image/png'); // Use PNG for lossless quality

            const pageW = width_on_tempCanvas;
            const pageH = height_on_tempCanvas;
            const orientation = pageW > pageH ? 'l' : 'p';

            if (firstImageAdded) {
              doc.addPage([pageW, pageH], orientation); // Set page size to selection dimensions in pixels
            } else {
              // For the very first image, set the initial page size and orientation
              doc.internal.pageSize.width = pageW;
              doc.internal.pageSize.height = pageH;
              doc.internal.pageSize.orientation = orientation;
              firstImageAdded = true;
            }

            doc.addImage(imgData, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST'); // Add image to fill the page
          }
        }
      }

      if (firstImageAdded) {
        console.log("Saving PDF.");
        doc.save(`selections_${Date.now()}.pdf`); // Add timestamp to filename
      } else {
        alert("No selections found to generate PDF.");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("An error occurred while generating the PDF. Check console for details.");
    } finally {
      setIsGeneratingPdf(false); // Ensure loading state is reset
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>PDF Viewer with Box Selection</h1>
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
        <button onClick={generatePdfFromSelections} disabled={!pdfFile || Object.keys(pageSelections).length === 0 || isGeneratingPdf}>
          {isGeneratingPdf ? 'Generating PDF...' : 'Generate PDF from All Selections'}
        </button>
        <button onClick={() => setConstrainAspectRatio(prev => !prev)} className={constrainAspectRatio ? 'active' : ''}>
          Constrain to 16:9 Aspect Ratio: {constrainAspectRatio ? 'On' : 'Off'}
        </button>
      </header>
      <div className="pdf-viewer-container"
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}
           onMouseLeave={handleMouseUp}
      >
        {pdfFile && (
          <Document
            key={pdfFile ? pdfFile.name : 'no-pdf'} // Add key to force re-render on new PDF
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
          >
            <Page
              pageNumber={pageNumber}
              inputRef={pageRef}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              onRenderSuccess={onPageRenderSuccess}
            />
          </Document>
        )}
        {isSelecting && selectionRect && (
          <div
            className="selection-box"
            style={{
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height,
            }}
          ></div>
        )}
        {pageSelections[pageNumber] && pageSelections[pageNumber].map(sel => (
          <div
            key={sel.id}
            className="selection-box saved-selection"
            data-selection-id={sel.id} // Add data attribute for identification
            style={{
              left: sel.left,
              top: sel.top,
              width: sel.width,
              height: sel.height,
            }}
          >
            <button
              className="delete-selection-button"
              onClick={(e) => {
                e.stopPropagation();
                deleteSelection(sel.id);
              }}
            >
              X
            </button>
          </div>
        ))}
      </div>
      {pdfFile && (
        <div className="page-navigation">
          <p>
            Page {pageNumber || (numPages ? 1 : '--')} of {numPages || '--'}
          </p>
          <button
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(prevPageNumber => prevPageNumber - 1)}
          >
            Previous
          </button>
          <button
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber(prevPageNumber => prevPageNumber + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
