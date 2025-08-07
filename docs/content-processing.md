# Content Processing

## Overview

The content processing system transforms raw content from various sources into searchable document chunks through a modular pipeline architecture.

## Content Sources

### Web Sources

- HTTP/HTTPS URLs with JavaScript rendering support
- Playwright-based scraping for dynamic content
- Configurable depth and page limits
- Respect for robots.txt and rate limiting

### Local Files

- `file://` protocol for local filesystem access
- Recursive directory processing
- MIME type detection for content routing
- Support for HTML, Markdown, and text files

### Package Registries

- npm registry documentation extraction
- PyPI package documentation
- Version-specific documentation retrieval
- Package metadata integration

## Processing Pipeline

### Fetcher Layer

Abstracts content retrieval across sources:

**HttpFetcher:**

- Handles web content with Playwright
- JavaScript execution and DOM rendering
- Cookie and session management
- Retry logic and error handling

**FileFetcher:**

- Local filesystem access
- MIME type detection
- Directory traversal with filtering
- File encoding detection

### Middleware Chain

Content transforms through ordered middleware:

1. **Content Parser**: HTML/Markdown parsing
2. **Metadata Extractor**: Title, description, timestamps
3. **Link Processor**: Internal link resolution
4. **Content Cleaner**: Remove navigation, ads, boilerplate
5. **Structure Normalizer**: Consistent heading hierarchy

### Pipeline Selection

Content routes to appropriate pipeline based on MIME type:

**HtmlPipeline:**

- DOM parsing and structure extraction
- Navigation removal and content isolation
- Link context preservation
- Metadata extraction from HTML tags

**MarkdownPipeline:**

- Markdown parsing and structure analysis
- Code block preservation
- Link and reference processing
- Front matter extraction

## Content Transformation

### HTML Processing

1. Parse DOM structure using Playwright
2. Remove navigation elements and ads
3. Extract main content areas
4. Preserve code blocks and tables
5. Convert to clean Markdown format

### Markdown Processing

1. Parse Markdown AST
2. Extract front matter metadata
3. Process code blocks and tables
4. Resolve relative links
5. Normalize heading structure

### Metadata Extraction

Common metadata across content types:

- Document title and description
- Creation and modification timestamps
- Author information
- Version and library association
- URL and source context

## Document Splitting

### Semantic Chunking

Content splits based on document structure rather than arbitrary size:

**Structure-Aware Splitting:**

- Respect heading boundaries
- Keep code blocks intact
- Preserve table structure
- Maintain list coherence

**Context Preservation:**

- Include parent heading context
- Preserve sibling relationships
- Maintain source URL attribution
- Sequential ordering for navigation

### Chunking Strategies

**GreedySplitter:**

- Maximum chunk size with overflow handling
- Simple implementation for basic content
- Size-based splitting with structure hints

**SemanticMarkdownSplitter:**

- Markdown structure-aware chunking
- Heading hierarchy preservation
- Code block and table integrity
- Context-rich chunk boundaries

## Content Filtering

### Noise Removal

Automatic filtering of common noise:

- Navigation menus and sidebars
- Advertisement content
- Cookie notices and popups
- Social media widgets
- Comment sections

### Content Quality

Quality assessment and filtering:

- Minimum content length thresholds
- Language detection and filtering
- Duplicate content detection
- Boilerplate text removal

## URL Context Management

### Link Resolution

Process and resolve various link types:

- Absolute URLs preserved as-is
- Relative URLs resolved against base URL
- Fragment links handled appropriately
- Invalid links logged and skipped

### URL Normalization

Consistent URL formatting:

- Protocol normalization (http/https)
- Path canonicalization
- Query parameter ordering
- Fragment handling

### Scope Management

Content scoping based on configuration:

- Same-domain restrictions
- Path prefix limitations
- Maximum depth enforcement
- URL pattern filtering

## Progress Tracking

### Processing Metrics

Track processing progress:

- Pages discovered vs processed
- Processing rate (pages/minute)
- Error count and types
- Memory usage and performance

### Real-time Updates

Progress reporting through callbacks:

- Page-level progress updates
- Status change notifications
- Error and warning reporting
- Completion estimates

## Error Handling

### Graceful Degradation

Handle various error conditions:

- Network timeouts and failures
- Invalid content format
- Parsing errors
- Memory limitations

### Error Classification

Different error handling strategies:

- **Recoverable**: Retry with backoff
- **Content**: Skip and continue
- **Fatal**: Stop processing with error
- **Warning**: Log and continue

### Error Reporting

Comprehensive error information:

- Specific error messages
- Processing context
- URL and content details
- Stack traces for debugging

## Content Optimization

### Memory Management

Efficient memory usage:

- Streaming content processing
- Chunk-based processing
- Memory-mapped files for large content
- Garbage collection optimization

### Performance Tuning

Processing optimization:

- Parallel content fetching
- Cached DOM parsing
- Efficient text processing
- Database batch operations

### Resource Limits

Configurable resource constraints:

- Maximum page size
- Processing timeout limits
- Memory usage caps
- Concurrent request limits

## Integration Points

### Embedding Generation

Content flows to embedding generation:

- Consistent chunk formatting
- Metadata preservation
- Vector dimension consistency
- Provider-specific formatting

### Storage Layer

Processed content storage:

- Normalized chunk structure
- Metadata preservation
- URL and context attribution
- Sequential ordering maintenance
