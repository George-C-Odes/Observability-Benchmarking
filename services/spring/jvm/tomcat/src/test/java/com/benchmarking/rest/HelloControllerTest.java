package com.benchmarking.rest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.containsString;

@SpringBootTest
@AutoConfigureMockMvc
public class HelloControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void testPlatformEndpoint() throws Exception {
        mockMvc.perform(get("/hello/platform"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().string(containsString("Hello from Boot platform REST")));
    }

    @Test
    public void testPlatformEndpointWithSleep() throws Exception {
        mockMvc.perform(get("/hello/platform").param("sleep", "1"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().string(containsString("Hello from Boot platform REST")));
    }

    @Test
    public void testPlatformEndpointWithLog() throws Exception {
        mockMvc.perform(get("/hello/platform").param("log", "true"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().string(containsString("Hello from Boot platform REST")));
    }

    @Test
    public void testVirtualEndpoint() throws Exception {
        mockMvc.perform(get("/hello/virtual"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().string(containsString("Hello from Boot virtual REST")));
    }

    @Test
    public void testVirtualEndpointWithSleep() throws Exception {
        mockMvc.perform(get("/hello/virtual").param("sleep", "1"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().string(containsString("Hello from Boot virtual REST")));
    }

    @Test
    public void testVirtualEndpointWithLog() throws Exception {
        mockMvc.perform(get("/hello/virtual").param("log", "true"))
            .andExpect(status().isOk())
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(content().string(containsString("Hello from Boot virtual REST")));
    }
}
