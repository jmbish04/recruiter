import { MCPRequest, MCPResponse, MCPToolCallParams } from "./types";

/**
 * Query the Cloudflare Docs MCP API
 */
export async function queryMCP(
  query: string,
  context?: string,
  mcpApiUrl?: string
): Promise<any> {
  const url = mcpApiUrl || "https://docs.mcp.cloudflare.com/mcp";

  try {
    // Create MCP JSON-RPC request
    // The remote tool is named 'search_cloudflare_documentation'
    const request = createMCPRequest("tools/call", {
      name: "search_cloudflare_documentation",
      arguments: {
        query,
        context,
      },
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `MCP API error (${response.status}): ${errorText}`
      );
    }

    let data: any;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            const parsed = JSON.parse(jsonStr);
            if (parsed.result || parsed.error) {
              data = parsed;
              break;
            }
          } catch (e) {
            // Continue searching
          }
        }
      }
      if (!data) {
        throw new Error("No valid JSON-RPC response found in SSE stream");
      }
    } else {
      data = await response.json() as any;
    }
    
    // Handle JSON-RPC response
    if (data.error) {
      throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
    }

    // Return the tool result
    // Cloudflare's MCP server tool result format usually puts the content in 'content' array
    if (data.result && data.result.content && Array.isArray(data.result.content)) {
      // Extract text from the first content item if possible, or return the whole result
      const textContent = data.result.content.find((c: any) => c.type === 'text');
      if (textContent) {
        return textContent.text;
      }
      return data.result.content;
    }

    return data.result;
  } catch (error) {
    console.error("MCP query error:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown MCP error",
      query,
    };
  }
}

/**
 * Query MCP with event stream support (for WebSocket)
 */
export async function queryMCPStream(
  query: string,
  context?: string,
  mcpApiUrl?: string
): Promise<ReadableStream> {
  const url = mcpApiUrl || "https://docs.mcp.cloudflare.com/mcp";

  // Create MCP JSON-RPC request
  const request = createMCPRequest("tools/call", {
    name: "search_cloudflare_documentation",
    arguments: {
      query,
      context,
    },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // FIX: The server requires both types to be present in the Accept header
      "Accept": "text/event-stream, application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`MCP API error (${response.status})`);
  }

  return response.body!;
}

/**
 * Create a JSON-RPC 2.0 request for MCP
 */
export function createMCPRequest(
  method: string,
  params?: any,
  id?: string | number
): MCPRequest {
  return {
    jsonrpc: "2.0",
    method,
    params,
    id: id || Date.now(),
  };
}

/**
 * Create a JSON-RPC 2.0 response for MCP
 */
export function createMCPResponse(
  result?: any,
  error?: { code: number; message: string; data?: any },
  id?: string | number
): MCPResponse {
  return {
    jsonrpc: "2.0",
    result,
    error,
    id: id ?? null,
  };
}
